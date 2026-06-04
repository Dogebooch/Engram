r"""Deterministic pre-build check for a Claude-authored draft_symbols.json.

The free quality gate for the ingest autopilot, and a self-check for the manual
ingest-video skill: it never calls a model, so it is cheap, fully repeatable, and
gives the same verdict every time. It targets the error classes a model is least
reliable at catching in its own work:

  - structural / empty required fields (fact, symbol_description, meaning, evidence),
  - fabricated evidence: a quoted span that does not appear in the transcript,
  - true duplicate bullets the builder would silently collapse,
  - timestamps that fall outside the video,
  - (advisory) likely under-extraction on a dense transcript.

It mirrors how `ingest_video.make_bundle` reads the draft, so its checks match what
actually gets built -- in particular the duplicate rule keys on (fact, symbol_key)
exactly like the builder, so reusing one symbol_key under two different facts (the
"one symbol, two facts" feature) is NOT flagged. Evidence grounding is fuzzy
(token-window overlap >= 0.6 of the quote) so legitimate ASR fixes
("tetrahydrofluoric" -> tetrahydrofolate) still pass while wholesale fabrication fails.

Prints a JSON verdict {ok, errors, warnings, stats} and exits 0 (ok) or 1 (errors).
Stdlib only.

  python lint_draft.py --run-dir <out-root>\<slug>
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

REQUIRED_FIELDS = ("fact", "symbol_description", "meaning", "evidence")
DENSE_SEGMENTS = 250  # mirrors ingest_queue.DENSE_SEGMENTS
GROUND_MIN_RATIO = 0.6  # a quote must overlap the transcript at least this much
UNDER_EXTRACTION_FLOOR = (
    12  # dense transcripts almost always name more symbols than this
)

_Q = "\"'`“”‘’"
QUOTE_RE = re.compile(f"[{_Q}]([^{_Q}]{{6,}})[{_Q}]")


def clean(value: object) -> str:
    return " ".join(str(value or "").split())


def norm(value: str) -> str:
    """Lowercase, non-alphanumeric -> single spaces, for fuzzy text comparison."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


def slug(value: str) -> str:
    """Mirror ingest_video.slugify so duplicate detection matches the builder."""
    s = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return s[:80] or "video"


def best_quote(evidence: str) -> str | None:
    """The longest quoted span in the evidence string (the transcript citation)."""
    spans = [m.group(1).strip() for m in QUOTE_RE.finditer(evidence or "")]
    spans = [s for s in spans if s]
    return max(spans, key=len) if spans else None


def grounding_ratio(quote: str, transcript_tokens: list[str]) -> float:
    """Best token-overlap of the quote against any same-length transcript window.

    Token-window (not contiguous-substring) so a single swapped/ASR-fixed word
    inside the quote still scores high, while a fabricated quote scores low.
    """
    qt = norm(quote).split()
    if not qt:
        return 1.0
    qc = Counter(qt)
    n = len(qt)
    best = 0.0
    for i in range(0, max(1, len(transcript_tokens) - n + 1)):
        window = Counter(transcript_tokens[i : i + n])
        overlap = sum((qc & window).values()) / n
        if overlap > best:
            best = overlap
            if best >= 0.999:
                break
    return best


def lint(run_dir: Path, draft_path: Path) -> dict:
    errors: list[dict] = []
    warnings: list[dict] = []

    draft = json.loads(draft_path.read_text(encoding="utf-8"))
    symbols = draft.get("symbols") if isinstance(draft, dict) else None
    if not isinstance(symbols, list) or not symbols:
        return {
            "ok": False,
            "errors": [
                {"code": "no-symbols", "msg": "draft has no symbols[] to build"}
            ],
            "warnings": [],
            "stats": {"symbols": 0},
        }

    transcript_tokens: list[str] = []
    seg_count = 0
    tpath = run_dir / "transcript.json"
    if tpath.exists():
        t = json.loads(tpath.read_text(encoding="utf-8"))
        segs = t.get("segments", []) if isinstance(t, dict) else []
        seg_count = len(segs)
        transcript_tokens = norm(" ".join(clean(s.get("text")) for s in segs)).split()
    if not transcript_tokens:
        warnings.append(
            {
                "code": "transcript-unavailable",
                "msg": "no transcript; evidence grounding skipped",
            }
        )

    duration_ms = 0
    vpath = run_dir / "video_info.json"
    if vpath.exists():
        vi = json.loads(vpath.read_text(encoding="utf-8"))
        duration_ms = int(vi.get("duration_ms") or 0)

    grounded = ungrounded = missing_key = 0
    seen_bullets: dict[tuple, object] = {}

    for idx, sym in enumerate(symbols):
        if not isinstance(sym, dict):
            errors.append(
                {"order": idx, "code": "bad-symbol", "msg": "symbol is not an object"}
            )
            continue
        order = sym.get("order", idx)
        key = clean(sym.get("symbol_key"))
        ref = key or slug(clean(sym.get("symbol_description")) or f"sym-{idx}")

        for field in REQUIRED_FIELDS:
            if not clean(sym.get(field)):
                errors.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "missing-field",
                        "msg": f"empty required field: {field}",
                    }
                )

        if not key:
            missing_key += 1

        ts = sym.get("timestamp_ms")
        if ts is None:
            warnings.append(
                {
                    "order": order,
                    "symbol_key": ref,
                    "code": "no-timestamp",
                    "msg": "no timestamp_ms; builder defaults to the backdrop frame",
                }
            )
        else:
            try:
                ts = int(ts)
                if ts < 0 or (duration_ms and ts > duration_ms + 2000):
                    errors.append(
                        {
                            "order": order,
                            "symbol_key": ref,
                            "code": "bad-timestamp",
                            "msg": f"timestamp_ms {ts} outside video (0..{duration_ms})",
                        }
                    )
            except (TypeError, ValueError):
                errors.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "bad-timestamp",
                        "msg": f"timestamp_ms not an integer: {ts!r}",
                    }
                )

        if transcript_tokens:
            quote = best_quote(clean(sym.get("evidence")))
            if quote is None:
                warnings.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "no-quote",
                        "msg": "evidence has no quoted span to verify against the transcript",
                    }
                )
            else:
                ratio = grounding_ratio(quote, transcript_tokens)
                if ratio >= GROUND_MIN_RATIO:
                    grounded += 1
                else:
                    ungrounded += 1
                    errors.append(
                        {
                            "order": order,
                            "symbol_key": ref,
                            "code": "ungrounded-evidence",
                            "msg": f'quoted evidence not in transcript (overlap {ratio:.2f}): "{quote[:60]}"',
                        }
                    )

        bullet = (
            slug(clean(sym.get("fact"))),
            key or slug(clean(sym.get("symbol_description"))),
        )
        if bullet in seen_bullets:
            errors.append(
                {
                    "order": order,
                    "symbol_key": ref,
                    "code": "duplicate-bullet",
                    "msg": f"same fact+symbol as order {seen_bullets[bullet]}; builder drops one",
                }
            )
        else:
            seen_bullets[bullet] = order

    if missing_key:
        warnings.append(
            {
                "code": "missing-symbol-key",
                "msg": f"{missing_key}/{len(symbols)} symbols have no symbol_key (builder slugs the description; set keys for glossary consistency and two-facts reuse)",
            }
        )

    if seg_count >= DENSE_SEGMENTS and len(symbols) < UNDER_EXTRACTION_FLOOR:
        warnings.append(
            {
                "code": "possible-under-extraction",
                "msg": f"dense transcript ({seg_count} segs) but only {len(symbols)} symbols; check for dropped symbols",
            }
        )

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "stats": {
            "symbols": len(symbols),
            "facts": len(
                {slug(clean(s.get("fact"))) for s in symbols if isinstance(s, dict)}
            ),
            "segments": seg_count,
            "grounded": grounded,
            "ungrounded": ungrounded,
            "duplicates": sum(1 for e in errors if e.get("code") == "duplicate-bullet"),
        },
    }


def main() -> int:
    p = argparse.ArgumentParser(
        description="Lint a Claude-authored draft_symbols.json before building."
    )
    p.add_argument(
        "--run-dir",
        type=Path,
        required=True,
        help="Run dir holding transcript.json / video_info.json.",
    )
    p.add_argument(
        "--draft",
        type=Path,
        default=None,
        help="draft_symbols.json (default: <run-dir>/draft_symbols.json).",
    )
    args = p.parse_args()
    draft_path = args.draft or (args.run_dir / "draft_symbols.json")
    if not draft_path.exists():
        print(
            json.dumps(
                {
                    "ok": False,
                    "errors": [{"code": "no-draft", "msg": f"not found: {draft_path}"}],
                    "warnings": [],
                    "stats": {},
                }
            )
        )
        return 1
    result = lint(args.run_dir, draft_path)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
