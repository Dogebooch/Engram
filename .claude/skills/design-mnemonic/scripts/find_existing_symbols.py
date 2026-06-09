#!/usr/bin/env python3
"""Search the user's ingested Pixorize/Sketchy library for an EXISTING symbol.

Before inventing a fresh sound-alike, the `design-mnemonic` skill checks whether
the source programs (Pixorize, Sketchy, Picmonic) already have an established
visual for a term — and reuses it, so a symbol means the same thing across the
whole study set. This scans every built `.engram.zip` under the ingest out-root,
reads each bundle's `notes.md`, and returns the symbols whose text matches a query
term, grouped by recurrence (a symbol used in many scenes is the canonical one).

Stdlib only. Run with any Python:
    python find_existing_symbols.py "thiamine"
    python find_existing_symbols.py --source pixorize --limit 8 "beta blocker"

Out-root defaults to ENGRAM_OUT_ROOT or P:\\Python Projects\\Engram\\video-ingest-runs.
Output: JSON on stdout. Never raises for "no results"; only structural errors set
ok=false so the skill can fall back to inventing a symbol.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

DEFAULT_OUT_ROOT = Path(r"P:\Python Projects\Engram\video-ingest-runs")

# Short words that shouldn't drive a match on their own.
_STOP = {
    "the",
    "a",
    "an",
    "of",
    "for",
    "and",
    "or",
    "to",
    "in",
    "on",
    "is",
    "are",
    "with",
    "by",
    "as",
    "at",
    "drug",
    "drugs",
    "level",
    "levels",
}

_ARROW = re.compile(r"->|→")
_SYM_TOKEN = re.compile(r"\{sym:[0-9a-fA-F-]+\}")
_WORD = re.compile(r"[a-z0-9]+")


def tokens(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 2]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def parse_bullet(line: str) -> dict[str, str] | None:
    """Minimal mirror of src/lib/notes/bullet.ts: description / meaning / encoding."""
    body = line.lstrip()
    if body[:1] in "*-+":
        body = body[1:].lstrip()
    if not _SYM_TOKEN.match(body):
        return None
    body = _SYM_TOKEN.sub("", body, count=1).strip()
    m = _ARROW.search(body)
    if not m:
        return {"description": body, "meaning": "", "encoding": ""}
    description = body[: m.start()].strip()
    rest = body[m.end() :].strip()
    sep = rest.find(";")
    if sep == -1:
        return {"description": description, "meaning": rest, "encoding": ""}
    return {
        "description": description,
        "meaning": rest[:sep].strip(),
        "encoding": rest[sep + 1 :].strip(),
    }


def iter_symbols(notes: str):
    """Yield (fact_heading, parsed_bullet) over a notes.md body."""
    fact = ""
    for raw in notes.splitlines():
        if raw.startswith("## "):
            fact = raw[3:].strip()
        elif raw.lstrip()[:1] in "*-+":
            parsed = parse_bullet(raw)
            if parsed and parsed["description"]:
                yield fact, parsed


def score(query_tokens: list[str], query: str, rec: dict[str, str]) -> int:
    """Weighted field match: meaning is the strongest reuse signal."""
    fields = (
        (rec["meaning"], 3),
        (rec["encoding"], 2),
        (rec["description"], 2),
        (rec["fact"], 1),
        (rec["scene"], 1),
    )
    total = 0
    for text, weight in fields:
        low = text.lower()
        toks = set(tokens(text))
        total += weight * sum(1 for q in query_tokens if q in toks)
        if query and query.lower() in low:
            total += weight  # contiguous phrase bonus
    return total


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="+", help="Term/concept to find a symbol for.")
    parser.add_argument("--out-root", default=None, help="Ingest run-dir root.")
    parser.add_argument(
        "--source",
        default=None,
        help="Filter by source substring (e.g. pixorize, sketchy).",
    )
    parser.add_argument("--limit", type=int, default=12, help="Max grouped results.")
    args = parser.parse_args()

    query = " ".join(args.query).strip()
    qtokens = tokens(query)
    root = (
        Path(args.out_root)
        if args.out_root
        else Path(os.environ.get("ENGRAM_OUT_ROOT") or DEFAULT_OUT_ROOT)
    )
    if not root.exists():
        print(
            json.dumps(
                {"ok": False, "error": f"out-root not found: {root}", "results": []}
            )
        )
        return 0

    source_filter = (args.source or "").lower()
    # Group identical symbols across scenes: a recurring (description, meaning)
    # is the canonical visual to reuse.
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    scanned = 0

    for run_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        if run_dir.name.startswith("_"):
            continue  # skip _engram-import (copies) and other meta dirs
        zips = sorted(run_dir.glob("*.engram.zip"))
        if not zips:
            continue
        try:
            with zipfile.ZipFile(zips[0]) as zf:
                names = zf.namelist()
                meta_name = next((n for n in names if n.endswith("meta.json")), None)
                notes_name = next((n for n in names if n.endswith("notes.md")), None)
                if not notes_name:
                    continue
                meta = json.loads(zf.read(meta_name)) if meta_name else {}
                notes = zf.read(notes_name).decode("utf-8", "replace")
        except (zipfile.BadZipFile, json.JSONDecodeError, OSError):
            continue

        sv = meta.get("sourceVideo") or {}
        source = str(sv.get("source") or "")
        if source_filter and source_filter not in source.lower():
            continue
        scanned += 1
        scene = str(meta.get("name") or run_dir.name)
        course = str(sv.get("course") or "")

        for fact, parsed in iter_symbols(notes):
            rec = {**parsed, "fact": fact, "scene": scene}
            s = score(qtokens, query, rec)
            if s <= 0:
                continue
            key = (slug(parsed["description"])[:70], slug(parsed["meaning"]))
            g = groups.get(key)
            if g is None:
                g = {
                    "description": parsed["description"],
                    "meaning": parsed["meaning"],
                    "encoding": parsed["encoding"],
                    "score": s,
                    "occurrences": 0,
                    "scenes": [],
                }
                groups[key] = g
            g["score"] = max(g["score"], s)
            g["occurrences"] += 1
            if len(g["scenes"]) < 4:
                g["scenes"].append({"scene": scene, "source": source, "course": course})

    results = sorted(
        groups.values(), key=lambda g: (g["score"], g["occurrences"]), reverse=True
    )[: args.limit]

    print(
        json.dumps(
            {
                "ok": True,
                "query": query,
                "outRoot": str(root),
                "bundlesScanned": scanned,
                "matched": len(groups),
                "results": results,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
