"""Workflow wrapper and gold-bundle scorer for Engram video ingest.

The gold corpus is read-only: existing ``<slug>/<slug>.engram.zip`` bundles are
parsed as the answer key, and experimental runs should write to a separate root.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import zipfile
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

DEFAULT_GOLD_ROOT = Path(r"P:\Python Projects\Engram\video-ingest-runs")
DEFAULT_EVAL_ROOT = Path(r"P:\Python Projects\Engram\video-ingest-eval-runs")
TOOL_DIR = Path(__file__).resolve().parent
INGEST_VIDEO = TOOL_DIR / "ingest_video.py"
LINT_DRAFT = TOOL_DIR / "lint_draft.py"
MVS_TRANSCRIPT = TOOL_DIR / "mvs_transcript.py"

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

FACT_MATCH_THRESHOLD = 0.70
SYMBOL_MATCH_THRESHOLD = 0.62
PASS_FACT_RECALL = 0.95
PASS_SYMBOL_RECALL = 0.95
PASS_SYMBOL_PRECISION = 0.90
PASS_MEANING_SIMILARITY = 0.90

SYM_RE = re.compile(r"\{sym:([^}]+)\}")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
BULLET_RE = re.compile(r"^\s*[-*]\s+(.+?)\s*$")
SYMBOL_CUE_RE = re.compile(
    r"\b(represents?|represented|illustrated|shown by|shown|depicted|symboli[sz]ed|"
    r"symbol|clue|reminds?|means|stands for|is for|encodes?|anchor|"
    r"side effects?|adverse|mechanisms?|used for|treats?|causes?|associated with|"
    r"contraindicated|classes?|diagnos(?:is|tic)|toxicity|inhibits?|activates?)\b",
    re.IGNORECASE,
)
HIGH_YIELD_CONSEQUENCE_RE = re.compile(
    r"\b(damage|damaged|lesions?|palsy|diplopia|deplopia|double vision|deviation|"
    r"hyperthermia|hyperthemia|overheating|would lead|manifesting|experience|"
    r"inability)\b",
    re.IGNORECASE,
)
CRITICAL_TERM_ALIASES = {
    "damaged": "damage",
    "lesion": "lesions",
    "deplopia": "diplopia",
    "double": "diplopia",
    "vision": "diplopia",
    "hyperthemia": "hyperthermia",
    "overheating": "hyperthermia",
    "medial": "midline",
    "inward": "deviation",
}
CRITICAL_TERM_WHITELIST = frozenset(
    {
        "damage",
        "lesions",
        "palsy",
        "diplopia",
        "deviation",
        "horizontal",
        "midline",
        "inability",
        "hyperthermia",
        "overheating",
    }
)
SIGNIFICANT_STOPWORDS = frozenset(
    {
        "this",
        "that",
        "with",
        "from",
        "have",
        "your",
        "will",
        "what",
        "when",
        "were",
        "they",
        "them",
        "then",
        "than",
        "into",
        "over",
        "more",
        "most",
        "some",
        "such",
        "only",
        "also",
        "been",
        "here",
        "there",
        "their",
        "these",
        "those",
        "which",
        "while",
        "would",
        "could",
        "should",
        "about",
        "after",
        "before",
        "between",
        "because",
        "where",
        "being",
        "does",
        "doing",
        "each",
        "other",
        "like",
        "just",
        "very",
        "much",
        "many",
        "well",
        "video",
        "mnemonic",
        "usmle",
        "pixorize",
    }
)

SEMANTIC_PHRASES = (
    ("heart attack", "myocardial infarction"),
    ("mi", "myocardial infarction"),
    ("cranial nerve six", "cranial nerve vi"),
    ("cranial nerve 6", "cranial nerve vi"),
    ("cn six", "cn vi"),
    ("cn 6", "cn vi"),
    ("vitamin b1", "thiamine"),
)


@dataclass
class ParsedBullet:
    raw: str
    symbol_id: str | None
    description: str
    meaning: str
    encoding: str


@dataclass
class ParsedFact:
    name: str
    bullets: list[ParsedBullet]


@dataclass
class ParsedBundle:
    slug: str
    title: str
    bundle_path: str
    notes_member: str
    canvas_member: str
    meta_member: str
    facts: list[ParsedFact]
    canvas_symbol_ids: list[str]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "video"


def bundle_slug(path: Path) -> str:
    name = path.name
    if name.endswith(".engram.zip"):
        return name[: -len(".engram.zip")]
    return path.stem


def clean(value: object) -> str:
    return " ".join(str(value or "").split())


def normalize(value: str, *, semantic: bool = False) -> str:
    text = value.lower()
    if semantic:
        for source, target in SEMANTIC_PHRASES:
            text = re.sub(rf"\b{re.escape(source)}\b", target, text)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def tokens(value: str, *, semantic: bool = False) -> list[str]:
    return normalize(value, semantic=semantic).split()


def ratio(num: int | float, den: int | float) -> float:
    if den == 0:
        return 1.0
    return round(float(num) / float(den), 4)


def token_f1(a: str, b: str, *, semantic: bool = False) -> float:
    a_tokens = tokens(a, semantic=semantic)
    b_tokens = tokens(b, semantic=semantic)
    if not a_tokens and not b_tokens:
        return 1.0
    if not a_tokens or not b_tokens:
        return 0.0
    remaining = b_tokens[:]
    overlap = 0
    for token in a_tokens:
        if token in remaining:
            overlap += 1
            remaining.remove(token)
    precision = overlap / len(a_tokens)
    recall = overlap / len(b_tokens)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def text_similarity(a: str, b: str, *, semantic: bool = False) -> float:
    left = normalize(a, semantic=semantic)
    right = normalize(b, semantic=semantic)
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    return round(
        max(
            SequenceMatcher(None, left, right).ratio(),
            token_f1(a, b, semantic=semantic),
        ),
        4,
    )


def bullet_similarity(
    gold: ParsedBullet, generated: ParsedBullet, *, semantic: bool = False
) -> dict[str, float]:
    description = text_similarity(
        gold.description, generated.description, semantic=semantic
    )
    meaning = text_similarity(gold.meaning, generated.meaning, semantic=semantic)
    combined = round((description * 0.45) + (meaning * 0.55), 4)
    return {"combined": combined, "description": description, "meaning": meaning}


def find_zip_member(zf: zipfile.ZipFile, filename: str) -> str:
    matches = [
        name
        for name in zf.namelist()
        if name.replace("\\", "/") == filename
        or name.replace("\\", "/").endswith(f"/{filename}")
    ]
    if not matches:
        raise ValueError(f"bundle missing {filename}")
    return sorted(matches, key=len)[0]


def read_zip_text(zf: zipfile.ZipFile, member: str) -> str:
    return zf.read(member).decode("utf-8")


def parse_symbol_bullet(line: str) -> ParsedBullet:
    raw = clean(line)
    match = SYM_RE.search(raw)
    symbol_id = match.group(1).strip() if match else None
    body = SYM_RE.sub("", raw).strip()
    description = body
    meaning = ""
    encoding = ""
    arrow = re.search(r"\s*(?:->|→)\s*", body)
    if arrow:
        description = body[: arrow.start()].strip()
        rest = body[arrow.end() :].strip()
        if ";" in rest:
            meaning, encoding = (part.strip() for part in rest.split(";", 1))
        else:
            meaning = rest
    return ParsedBullet(
        raw=raw,
        symbol_id=symbol_id,
        description=clean(description),
        meaning=clean(meaning),
        encoding=clean(encoding),
    )


def parse_notes(notes: str) -> tuple[str | None, list[ParsedFact]]:
    title: str | None = None
    facts: list[ParsedFact] = []
    current: ParsedFact | None = None
    for line in notes.splitlines():
        heading = HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            text = clean(heading.group(2))
            if level == 1 and title is None:
                title = text
                current = None
            elif level >= 2:
                current = ParsedFact(name=text, bullets=[])
                facts.append(current)
            continue
        bullet = BULLET_RE.match(line)
        if bullet and current is not None:
            current.bullets.append(parse_symbol_bullet(bullet.group(1)))
    return title, facts


def parse_bundle(bundle_path: Path) -> ParsedBundle:
    bundle_path = bundle_path.resolve()
    with zipfile.ZipFile(bundle_path) as zf:
        notes_member = find_zip_member(zf, "notes.md")
        canvas_member = find_zip_member(zf, "canvas.json")
        meta_member = find_zip_member(zf, "meta.json")
        notes = read_zip_text(zf, notes_member)
        canvas = json.loads(read_zip_text(zf, canvas_member))
        meta = json.loads(read_zip_text(zf, meta_member))
    notes_title, facts = parse_notes(notes)
    title = clean(meta.get("name")) or clean(notes_title) or bundle_path.stem
    canvas_symbols = canvas.get("symbols", []) if isinstance(canvas, dict) else []
    symbol_ids = [
        clean(s.get("id"))
        for s in canvas_symbols
        if isinstance(s, dict) and clean(s.get("id"))
    ]
    return ParsedBundle(
        slug=bundle_slug(bundle_path),
        title=title,
        bundle_path=str(bundle_path),
        notes_member=notes_member,
        canvas_member=canvas_member,
        meta_member=meta_member,
        facts=facts,
        canvas_symbol_ids=symbol_ids,
    )


def parsed_bundle_to_dict(
    bundle: ParsedBundle, *, include_facts: bool = True
) -> dict[str, Any]:
    data = asdict(bundle)
    if not include_facts:
        data.pop("facts", None)
        data["fact_count"] = len(bundle.facts)
        data["symbol_count"] = sum(len(f.bullets) for f in bundle.facts)
    return data


def validate_importable(bundle: ParsedBundle) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    symbol_ids = set(bundle.canvas_symbol_ids)
    if not bundle.facts:
        issues.append(
            {"code": "no-facts", "msg": "bundle notes contain no fact headings"}
        )
    for fact in bundle.facts:
        for bullet in fact.bullets:
            if not bullet.symbol_id:
                issues.append(
                    {
                        "code": "missing-symbol-token",
                        "fact": fact.name,
                        "bullet": bullet.raw,
                    }
                )
            elif bullet.symbol_id not in symbol_ids:
                issues.append(
                    {
                        "code": "unknown-symbol-uuid",
                        "fact": fact.name,
                        "symbol_id": bullet.symbol_id,
                    }
                )
    return {"ok": not issues, "issues": issues}


def scan_gold_root(root: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for bundle_path in sorted(root.glob("*/*.engram.zip")):
        if bundle_path.parent.name != bundle_slug(bundle_path):
            continue
        try:
            parsed = parse_bundle(bundle_path)
            entry = parsed_bundle_to_dict(parsed)
            entry["valid"] = True
            entry["import_check"] = validate_importable(parsed)
        except Exception as exc:
            entry = {
                "slug": bundle_path.stem,
                "bundle_path": str(bundle_path.resolve()),
                "valid": False,
                "error": str(exc),
            }
        entries.append(entry)
    return entries


def write_gold_index(gold_root: Path, cache_path: Path) -> dict[str, Any]:
    index = {
        "schemaVersion": 1,
        "goldRoot": str(gold_root.resolve()),
        "updatedAt": dt.datetime.now(dt.UTC).isoformat(),
        "entries": scan_gold_root(gold_root),
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return index


def load_gold_index(
    gold_root: Path, cache_path: Path | None = None, *, refresh: bool = False
) -> dict[str, Any]:
    if cache_path and cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    if cache_path:
        return write_gold_index(gold_root, cache_path)
    return {
        "schemaVersion": 1,
        "goldRoot": str(gold_root.resolve()),
        "updatedAt": dt.datetime.now(dt.UTC).isoformat(),
        "entries": scan_gold_root(gold_root),
    }


def bundle_from_index_entry(entry: dict[str, Any]) -> ParsedBundle:
    facts = [
        ParsedFact(
            name=f["name"],
            bullets=[ParsedBullet(**b) for b in f.get("bullets", [])],
        )
        for f in entry.get("facts", [])
    ]
    return ParsedBundle(
        slug=entry["slug"],
        title=entry.get("title") or entry["slug"],
        bundle_path=entry["bundle_path"],
        notes_member=entry.get("notes_member", ""),
        canvas_member=entry.get("canvas_member", ""),
        meta_member=entry.get("meta_member", ""),
        facts=facts,
        canvas_symbol_ids=entry.get("canvas_symbol_ids", []),
    )


def find_gold_match(generated: ParsedBundle, index: dict[str, Any]) -> ParsedBundle:
    valid_entries = [e for e in index.get("entries", []) if e.get("valid", True)]
    for entry in valid_entries:
        if entry.get("slug") == generated.slug:
            return bundle_from_index_entry(entry)
    gen_title = normalize(generated.title)
    for entry in valid_entries:
        if normalize(entry.get("title", "")) == gen_title:
            return bundle_from_index_entry(entry)
    raise ValueError(
        f"no gold bundle matched slug/title: {generated.slug} / {generated.title}"
    )


def match_facts(
    gold: list[ParsedFact], generated: list[ParsedFact], *, semantic: bool = False
) -> list[dict[str, Any]]:
    candidates: list[tuple[float, int, int]] = []
    for gi, gf in enumerate(gold):
        for xi, xf in enumerate(generated):
            candidates.append(
                (text_similarity(gf.name, xf.name, semantic=semantic), gi, xi)
            )
    matches: list[dict[str, Any]] = []
    used_gold: set[int] = set()
    used_generated: set[int] = set()
    for score, gi, xi in sorted(candidates, reverse=True):
        if score < FACT_MATCH_THRESHOLD or gi in used_gold or xi in used_generated:
            continue
        used_gold.add(gi)
        used_generated.add(xi)
        matches.append(
            {"gold_index": gi, "generated_index": xi, "score": round(score, 4)}
        )
    return sorted(matches, key=lambda item: item["gold_index"])


def match_bullets(
    gold: list[ParsedBullet], generated: list[ParsedBullet], *, semantic: bool = False
) -> tuple[list[dict[str, Any]], list[int], list[int]]:
    candidates: list[tuple[float, float, float, int, int]] = []
    for gi, gb in enumerate(gold):
        for xi, xb in enumerate(generated):
            scores = bullet_similarity(gb, xb, semantic=semantic)
            candidates.append(
                (scores["combined"], scores["description"], scores["meaning"], gi, xi)
            )
    matches: list[dict[str, Any]] = []
    used_gold: set[int] = set()
    used_generated: set[int] = set()
    for combined, description, meaning, gi, xi in sorted(candidates, reverse=True):
        if combined < SYMBOL_MATCH_THRESHOLD or gi in used_gold or xi in used_generated:
            continue
        used_gold.add(gi)
        used_generated.add(xi)
        matches.append(
            {
                "gold_index": gi,
                "generated_index": xi,
                "combined": round(combined, 4),
                "description": round(description, 4),
                "meaning": round(meaning, 4),
            }
        )
    return (
        sorted(matches, key=lambda item: item["gold_index"]),
        [i for i in range(len(gold)) if i not in used_gold],
        [i for i in range(len(generated)) if i not in used_generated],
    )


def compare_bundles(
    generated: ParsedBundle,
    gold: ParsedBundle,
    *,
    lint_result: dict[str, Any] | None = None,
    semantic_judge: bool = False,
    require_lint: bool = True,
) -> dict[str, Any]:
    fact_matches = match_facts(gold.facts, generated.facts, semantic=semantic_judge)
    matched_gold_facts = {m["gold_index"] for m in fact_matches}
    matched_generated_facts = {m["generated_index"] for m in fact_matches}
    fact_details: list[dict[str, Any]] = []
    total_gold_symbols = sum(len(f.bullets) for f in gold.facts)
    total_generated_symbols = sum(len(f.bullets) for f in generated.facts)
    matched_symbols = 0
    meaning_scores: list[float] = []
    description_scores: list[float] = []
    missing_symbols: list[dict[str, str]] = []
    extra_symbols: list[dict[str, str]] = []

    for match in fact_matches:
        gf = gold.facts[match["gold_index"]]
        xf = generated.facts[match["generated_index"]]
        bullet_matches, missing_idx, extra_idx = match_bullets(
            gf.bullets, xf.bullets, semantic=semantic_judge
        )
        matched_symbols += len(bullet_matches)
        meaning_scores.extend(m["meaning"] for m in bullet_matches)
        description_scores.extend(m["description"] for m in bullet_matches)
        for idx in missing_idx:
            missing_symbols.append({"fact": gf.name, "bullet": gf.bullets[idx].raw})
        for idx in extra_idx:
            extra_symbols.append({"fact": xf.name, "bullet": xf.bullets[idx].raw})
        fact_details.append(
            {
                "gold_fact": gf.name,
                "generated_fact": xf.name,
                "fact_similarity": match["score"],
                "gold_symbols": len(gf.bullets),
                "generated_symbols": len(xf.bullets),
                "symbol_count_delta": len(xf.bullets) - len(gf.bullets),
                "matched_symbols": len(bullet_matches),
                "missing_symbols": [gf.bullets[i].raw for i in missing_idx],
                "extra_symbols": [xf.bullets[i].raw for i in extra_idx],
            }
        )

    missing_facts = [
        gold.facts[i].name
        for i in range(len(gold.facts))
        if i not in matched_gold_facts
    ]
    extra_facts = [
        generated.facts[i].name
        for i in range(len(generated.facts))
        if i not in matched_generated_facts
    ]
    for idx in range(len(gold.facts)):
        if idx not in matched_gold_facts:
            missing_symbols.extend(
                {"fact": gold.facts[idx].name, "bullet": b.raw}
                for b in gold.facts[idx].bullets
            )
    for idx in range(len(generated.facts)):
        if idx not in matched_generated_facts:
            extra_symbols.extend(
                {"fact": generated.facts[idx].name, "bullet": b.raw}
                for b in generated.facts[idx].bullets
            )

    import_check = validate_importable(generated)
    lint_ok = None
    lint_errors = None
    if lint_result is not None:
        lint_ok = bool(lint_result.get("ok"))
        lint_errors = len(lint_result.get("errors", []))
    fact_recall = ratio(len(matched_gold_facts), len(gold.facts))
    fact_precision = ratio(len(matched_generated_facts), len(generated.facts))
    symbol_recall = ratio(matched_symbols, total_gold_symbols)
    symbol_precision = ratio(matched_symbols, total_generated_symbols)
    meaning_similarity = (
        round(sum(meaning_scores) / len(meaning_scores), 4) if meaning_scores else 0.0
    )
    description_similarity = (
        round(sum(description_scores) / len(description_scores), 4)
        if description_scores
        else 0.0
    )
    pass_lint = (lint_ok is True) if require_lint else (lint_ok is not False)
    passed = (
        pass_lint
        and import_check["ok"]
        and fact_recall >= PASS_FACT_RECALL
        and symbol_recall >= PASS_SYMBOL_RECALL
        and symbol_precision >= PASS_SYMBOL_PRECISION
        and meaning_similarity >= PASS_MEANING_SIMILARITY
    )
    return {
        "schemaVersion": 1,
        "status": "pass" if passed else "fail",
        "semanticJudge": "local-synonym" if semantic_judge else "off",
        "generated": {
            "slug": generated.slug,
            "title": generated.title,
            "bundle": generated.bundle_path,
            "facts": len(generated.facts),
            "symbols": total_generated_symbols,
        },
        "gold": {
            "slug": gold.slug,
            "title": gold.title,
            "bundle": gold.bundle_path,
            "facts": len(gold.facts),
            "symbols": total_gold_symbols,
        },
        "lint": {"ok": lint_ok, "errors": lint_errors, "required": require_lint},
        "importCheck": import_check,
        "metrics": {
            "factRecall": fact_recall,
            "factPrecision": fact_precision,
            "symbolRecall": symbol_recall,
            "symbolPrecision": symbol_precision,
            "meaningSimilarity": meaning_similarity,
            "descriptionSimilarity": description_similarity,
            "matchedFacts": len(matched_gold_facts),
            "matchedSymbols": matched_symbols,
        },
        "thresholds": {
            "factRecall": PASS_FACT_RECALL,
            "symbolRecall": PASS_SYMBOL_RECALL,
            "symbolPrecision": PASS_SYMBOL_PRECISION,
            "meaningSimilarity": PASS_MEANING_SIMILARITY,
        },
        "missingFacts": missing_facts,
        "extraFacts": extra_facts,
        "missingSymbols": missing_symbols,
        "extraSymbols": extra_symbols,
        "factDetails": fact_details,
    }


def utf8_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def run_subprocess(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=TOOL_DIR.parents[1],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=utf8_env(),
    )


def run_lint(run_dir: Path, draft: Path | None = None) -> dict[str, Any]:
    command = [sys.executable, str(LINT_DRAFT), "--run-dir", str(run_dir)]
    if draft:
        command += ["--draft", str(draft)]
    proc = run_subprocess(command)
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        result = {
            "ok": False,
            "errors": [
                {
                    "code": "lint-failed",
                    "msg": proc.stderr or proc.stdout or "lint failed",
                }
            ],
            "warnings": [],
            "stats": {},
        }
    workflow_dir(run_dir).mkdir(parents=True, exist_ok=True)
    (workflow_dir(run_dir) / "lint_result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return result


def workflow_dir(run_dir: Path) -> Path:
    return run_dir / "workflow"


def significant_terms(value: str, *, min_len: int = 4) -> list[str]:
    terms = []
    seen = set()
    for token in tokens(value):
        if len(token) < min_len or token in SIGNIFICANT_STOPWORDS or token in seen:
            continue
        seen.add(token)
        terms.append(token)
    return terms


def seg_start_ms(seg: dict[str, Any]) -> int:
    for key in ("start_ms", "start"):
        value = seg.get(key)
        if value is None:
            continue
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        if key == "start" and numeric < 10000:
            numeric *= 1000
        return int(numeric)
    return 0


def make_target_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index:03d}"


def build_coverage_targets(run_dir: Path) -> dict[str, Any]:
    info = read_json_if_exists(run_dir / "video_info.json", {})
    transcript = read_json_if_exists(run_dir / "transcript.json", {})
    ocr = read_json_if_exists(run_dir / "ocr.json", {})
    keyframes = read_json_if_exists(run_dir / "keyframes.json", [])
    segments = (
        [seg for seg in transcript.get("segments", []) if isinstance(seg, dict)]
        if isinstance(transcript, dict)
        else []
    )
    ocr_segments = (
        [seg for seg in ocr.get("segments", []) if isinstance(seg, dict)]
        if isinstance(ocr, dict)
        else []
    )
    transcript_terms = set(
        significant_terms(" ".join(clean(seg.get("text")) for seg in segments))
    )
    targets: list[dict[str, Any]] = []
    seen: set[tuple[str, int, str]] = set()

    def critical_terms(text: str) -> list[str]:
        found: list[str] = []
        for term in significant_terms(text, min_len=3):
            term = CRITICAL_TERM_ALIASES.get(term, term)
            if term in CRITICAL_TERM_WHITELIST and term not in found:
                found.append(term)
        return found

    def segment_window(index: int, *, before: int = 0, after: int = 2) -> str:
        start = max(0, index - before)
        end = min(len(segments), index + after + 1)
        return " ".join(clean(segments[i].get("text")) for i in range(start, end))

    def add_target(
        prefix: str,
        source: str,
        start_ms: int,
        text: str,
        terms: list[str],
        *,
        priority: str = "normal",
        critical: list[str] | None = None,
    ) -> None:
        text = clean(text)
        terms = [term for term in terms if term]
        if not text and not terms:
            return
        key = (source, start_ms, " ".join(terms) or normalize(text)[:80])
        if key in seen:
            return
        seen.add(key)
        targets.append(
            {
                "target_id": make_target_id(
                    prefix,
                    len([t for t in targets if str(t["target_id"]).startswith(prefix)]),
                ),
                "start_ms": int(start_ms),
                "source": source,
                "text": text,
                "required_terms": terms,
                "critical_terms": critical or [],
                "priority": priority,
                "required": True,
            }
        )

    for idx, seg in enumerate(segments):
        text = clean(seg.get("text"))
        if SYMBOL_CUE_RE.search(text):
            add_target(
                "cue",
                "transcript-cue",
                seg_start_ms(seg),
                text,
                significant_terms(text)[:12],
            )
        if HIGH_YIELD_CONSEQUENCE_RE.search(text):
            window_text = segment_window(idx)
            critical = critical_terms(window_text)
            if critical:
                add_target(
                    "critical",
                    "critical-consequence",
                    seg_start_ms(seg),
                    window_text,
                    significant_terms(window_text)[:16],
                    priority="high",
                    critical=critical,
                )

    for seg in ocr_segments:
        text = clean(seg.get("text"))
        terms = [term for term in significant_terms(text) if term in transcript_terms]
        if terms:
            critical = critical_terms(text)
            add_target(
                "ocr",
                "ocr-transcript",
                seg_start_ms(seg),
                text,
                terms[:12],
                priority="high" if critical else "normal",
                critical=critical,
            )

    title_text = " ".join(
        clean(info.get(k)) for k in ("title", "course", "source") if clean(info.get(k))
    )
    title_terms = [
        term
        for term in significant_terms(title_text)
        if not transcript_terms or term in transcript_terms
    ]
    if title_terms:
        add_target("title", "title-course", 0, title_text, title_terms[:12])

    if isinstance(keyframes, list):
        for frame in keyframes:
            if not isinstance(frame, dict):
                continue
            label_text = clean(
                frame.get("ocr")
                or frame.get("text")
                or frame.get("label")
                or frame.get("caption")
            )
            terms = [
                term
                for term in significant_terms(label_text)
                if not transcript_terms or term in transcript_terms
            ]
            if terms:
                add_target(
                    "keyframe",
                    "keyframe-label",
                    int(frame.get("timestamp_ms") or 0),
                    label_text,
                    terms[:12],
                )

    return {
        "schemaVersion": 1,
        "kind": "engram-coverage-targets",
        "runDir": str(run_dir),
        "generatedAt": dt.datetime.now(dt.UTC).isoformat(),
        "targets": targets,
        "summary": {
            "targets": len(targets),
            "transcriptCueTargets": sum(
                1 for t in targets if t["source"] == "transcript-cue"
            ),
            "ocrTargets": sum(1 for t in targets if t["source"] == "ocr-transcript"),
        },
    }


def write_coverage_targets(run_dir: Path) -> Path:
    path = workflow_dir(run_dir) / "coverage_targets.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(build_coverage_targets(run_dir), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return path


def write_backdrop_candidates(run_dir: Path) -> Path:
    keyframes = read_json_if_exists(run_dir / "keyframes.json", [])
    candidates = []
    for frame in keyframes if isinstance(keyframes, list) else []:
        if not isinstance(frame, dict):
            continue
        timestamp_ms = int(frame.get("timestamp_ms") or 0)
        hints = []
        if timestamp_ms <= 5000:
            hints.append("early-frame")
        if frame.get("selected_as_backdrop") and timestamp_ms <= 5000:
            hints.append("selected-backdrop-is-early")
        candidates.append(
            {
                "index": frame.get("index"),
                "timestamp_ms": timestamp_ms,
                "image": frame.get("image"),
                "diff_score": frame.get("diff_score"),
                "selected_as_backdrop": bool(frame.get("selected_as_backdrop")),
                "rejection_hints": hints,
            }
        )
    data = {
        "schemaVersion": 1,
        "kind": "engram-backdrop-candidates",
        "runDir": str(run_dir),
        "generatedAt": dt.datetime.now(dt.UTC).isoformat(),
        "candidates": candidates,
    }
    path = workflow_dir(run_dir) / "backdrop_candidates.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def needs_wider_keyframes(run_dir: Path) -> bool:
    keyframes = read_json_if_exists(run_dir / "keyframes.json", [])
    if not isinstance(keyframes, list) or len(keyframes) < 4:
        return True
    selected = [
        frame
        for frame in keyframes
        if isinstance(frame, dict) and frame.get("selected_as_backdrop")
    ]
    if not selected:
        return True
    return int(selected[0].get("timestamp_ms") or 0) <= 5000


def prepare_ingest_command(
    video: Path, out_root: Path, *, wide_keyframes: bool = False
) -> list[str]:
    command = [
        sys.executable,
        str(INGEST_VIDEO),
        "--video",
        str(video),
        "--out-root",
        str(out_root),
        "--skip-transcript",
        "--no-context",
    ]
    if wide_keyframes:
        command += [
            "--sample-seconds",
            "2",
            "--min-gap-seconds",
            "3",
            "--diff-threshold",
            "0",
            "--max-keyframes",
            "18",
        ]
    return command


def infer_bundle_from_run(run_dir: Path) -> Path:
    candidates = sorted(run_dir.glob("*.engram.zip"))
    if not candidates:
        raise FileNotFoundError(f"no .engram.zip found in {run_dir}")
    return candidates[0]


def infer_video_from_run(run_dir: Path) -> Path:
    info_path = run_dir / "video_info.json"
    if not info_path.exists():
        raise FileNotFoundError(f"missing video_info.json in {run_dir}")
    info = json.loads(info_path.read_text(encoding="utf-8"))
    path = Path(info.get("path", ""))
    if not path:
        raise ValueError("video_info.json has no path")
    return path


def write_author_packet(run_dir: Path) -> Path:
    wf_dir = workflow_dir(run_dir)
    wf_dir.mkdir(parents=True, exist_ok=True)
    info = read_json_if_exists(run_dir / "video_info.json", {})
    keyframes = read_json_if_exists(run_dir / "keyframes.json", [])
    transcript = read_json_if_exists(run_dir / "transcript.json", {})
    ocr = read_json_if_exists(run_dir / "ocr.json", {})
    coverage_path = workflow_dir(run_dir) / "coverage_targets.json"
    backdrop_path = workflow_dir(run_dir) / "backdrop_candidates.json"
    coverage = read_json_if_exists(coverage_path, {"targets": []})
    lines = [
        "# Engram Ingest Author Packet",
        "",
        f"- Title: {info.get('title', run_dir.name)}",
        f"- Video: {info.get('path', '')}",
        f"- Run dir: {run_dir}",
        "",
        "## Draft Contract",
        "",
        "Write `draft_symbols.json` as facts-only JSON: one symbol per narrated symbol/fact mapping.",
        "Required symbol fields: `order`, `fact`, `symbol_key`, `symbol_description`, `meaning`, `evidence`, `timestamp_ms`, `target_ids`, `evidence_quote`, `evidence_start_ms`.",
        "Start from `workflow/coverage_targets.json` as the recall contract before writing symbols.",
        "`meaning` must explain the mnemonic encoding/why, not repeat a bare label or slash list.",
        "`symbol_description` must name one concrete visual object and its location; do not copy another symbol's object into it.",
        '`evidence` must be `Transcript @m:ss "clean quote"`; quote exact transcript text without filler openers or truncated mid-sentence endings.',
        "Use ASCII house style in generated text; do not use approximately-equals or arrow glyphs.",
        "`target_ids` must reference `workflow/coverage_targets.json`; every target must be represented or listed in top-level `omissions[]` with a controlled reason.",
        "Do not omit a narrated, visible mnemonic symbol; if wording is ambiguous, write a conservative fact and ground it in transcript evidence.",
        "High-priority targets in `coverage_targets.json` are mandatory study facts; the linked symbol must include their `critical_terms` in fact/meaning/evidence.",
        "Uncovered targets, missing target_ids, unknown target_ids, missing critical terms, and possible-under-extraction are blocking recall failures.",
        "Do not add `bbox`, `polygon`, `point`, or SAM fields in V1.",
        f"- Coverage targets: `{coverage_path}`",
        f"- Backdrop candidates: `{backdrop_path}`",
        "",
        "## Keyframes",
        "",
    ]
    for frame in keyframes:
        marker = " backdrop" if frame.get("selected_as_backdrop") else ""
        lines.append(
            f"- {frame.get('index')}: {frame.get('timestamp_ms')} ms{marker} - `{frame.get('image')}`"
        )
    segments = transcript.get("segments", [])
    cue_segments = [
        seg
        for seg in segments
        if SYMBOL_CUE_RE.search(clean(seg.get("text")))
        or HIGH_YIELD_CONSEQUENCE_RE.search(clean(seg.get("text")))
    ]
    lines += ["", "## MVS Cue Segments", ""]
    if cue_segments:
        for seg in cue_segments:
            lines.append(f"- @{seg.get('start_ms', 0)} ms: {clean(seg.get('text'))}")
    else:
        lines.append("- No symbol-cue rows matched; inspect the full transcript.")
    lines += ["", "## Coverage Targets", ""]
    targets = coverage.get("targets", []) if isinstance(coverage, dict) else []
    if targets:
        for target in targets[:120]:
            lines.append(
                f"- {target.get('target_id')} @{target.get('start_ms', 0)} ms "
                f"[{target.get('source')}]: {clean(target.get('text'))}"
            )
        if len(targets) > 120:
            lines.append(
                f"- ... {len(targets) - 120} additional targets omitted from packet; read coverage_targets.json."
            )
    else:
        lines.append(
            "- No deterministic coverage targets generated; inspect full transcript/OCR."
        )
    lines += ["", "## Transcript", ""]
    full_limit = 120
    shown_segments = segments if len(segments) <= full_limit else segments[:full_limit]
    for seg in shown_segments:
        lines.append(f"- @{seg.get('start_ms', 0)} ms: {clean(seg.get('text'))}")
    if len(segments) > full_limit:
        lines.append(
            f"- ... {len(segments) - full_limit} additional transcript rows omitted from packet; read transcript.json if needed."
        )
    if ocr.get("segments"):
        lines += ["", "## OCR Cross-Check", ""]
        for seg in ocr.get("segments", []):
            lines.append(f"- @{seg.get('start_ms', 0)} ms: {clean(seg.get('text'))}")
    packet = wf_dir / "author_packet.md"
    packet.write_text("\n".join(lines), encoding="utf-8")
    template = {"model": "codex-facts-only", "symbols": [], "omissions": []}
    (wf_dir / "draft_template.json").write_text(
        json.dumps(template, indent=2), encoding="utf-8"
    )
    return packet


def read_json_if_exists(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_workflow_report(run_dir: Path, title: str, sections: list[str]) -> Path:
    wf_dir = workflow_dir(run_dir)
    wf_dir.mkdir(parents=True, exist_ok=True)
    path = wf_dir / "workflow_report.md"
    path.write_text("\n\n".join([f"# {title}", *sections]), encoding="utf-8")
    return path


def cmd_gold_index(args: argparse.Namespace) -> int:
    cache = args.cache or (args.eval_root / "gold_index.json")
    index = write_gold_index(args.gold_root, cache)
    output = {
        "goldRoot": index["goldRoot"],
        "cache": str(cache),
        "entries": len(index["entries"]),
        "valid": sum(1 for e in index["entries"] if e.get("valid")),
        "invalid": sum(1 for e in index["entries"] if not e.get("valid")),
    }
    print(json.dumps(output if args.json else index, indent=2, ensure_ascii=False))
    return 0


def cmd_coverage(args: argparse.Namespace) -> int:
    """Regenerate workflow/coverage_targets.json for an already-extracted run dir.

    The deterministic lint gate requires this file; this writes it from the run
    dir's transcript.json/ocr.json/keyframes.json without re-extracting frames."""
    run_dir = args.run_dir.resolve()
    path = write_coverage_targets(run_dir)
    data = json.loads(path.read_text(encoding="utf-8"))
    print(
        json.dumps(
            {"wrote": str(path), "targets": len(data.get("targets", []))},
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def cmd_prepare(args: argparse.Namespace) -> int:
    args.out_root.mkdir(parents=True, exist_ok=True)
    command = prepare_ingest_command(args.video, args.out_root)
    proc = run_subprocess(command)
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        return proc.returncode
    run_dir = args.out_root / slugify(args.video.stem)
    if needs_wider_keyframes(run_dir):
        wide = run_subprocess(
            prepare_ingest_command(args.video, args.out_root, wide_keyframes=True)
        )
        if wide.returncode != 0:
            wf = workflow_dir(run_dir)
            wf.mkdir(parents=True, exist_ok=True)
            (wf / "wide_keyframe_error.txt").write_text(
                wide.stdout + "\n" + wide.stderr, encoding="utf-8"
            )
    if not args.skip_mvs:
        mvs = run_subprocess(
            [
                sys.executable,
                str(MVS_TRANSCRIPT),
                "--run-dir",
                str(run_dir),
                "--path",
                str(args.video),
            ]
        )
        if mvs.returncode != 0:
            (workflow_dir(run_dir) / "mvs_transcript_error.txt").parent.mkdir(
                parents=True, exist_ok=True
            )
            (workflow_dir(run_dir) / "mvs_transcript_error.txt").write_text(
                mvs.stdout + "\n" + mvs.stderr, encoding="utf-8"
            )
    coverage_path = write_coverage_targets(run_dir)
    backdrop_path = write_backdrop_candidates(run_dir)
    packet = write_author_packet(run_dir)
    result = {
        "runDir": str(run_dir),
        "authorPacket": str(packet),
        "coverageTargets": str(coverage_path),
        "backdropCandidates": str(backdrop_path),
        "draft": str(run_dir / "draft_symbols.json"),
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    run_dir = args.run_dir.resolve()
    draft = args.draft or (run_dir / "draft_symbols.json")
    lint = run_lint(run_dir, draft)
    if not lint.get("ok"):
        print(
            json.dumps(
                {"status": "lint_failed", "lint": lint}, indent=2, ensure_ascii=False
            )
        )
        return 1
    video = args.video or infer_video_from_run(run_dir)
    command = [
        sys.executable,
        str(INGEST_VIDEO),
        "--video",
        str(video),
        "--out-root",
        str(run_dir.parent),
        "--reuse-run",
        "--draft-symbols",
        str(draft),
    ]
    if args.backdrop_index is not None:
        command += ["--backdrop-index", str(args.backdrop_index)]
    proc = run_subprocess(command)
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        return proc.returncode
    write_workflow_report(
        run_dir,
        "Engram Ingest Build",
        ["- Lint: pass", f"- Builder output:\n```json\n{proc.stdout.strip()}\n```"],
    )
    print(proc.stdout)
    return 0


def score_run(
    *,
    run_dir: Path | None,
    generated_bundle: Path,
    gold_root: Path,
    gold_index_path: Path | None,
    refresh_gold: bool,
    semantic_judge: bool,
    require_lint: bool,
) -> dict[str, Any]:
    lint_result = run_lint(run_dir) if run_dir else None
    generated = parse_bundle(generated_bundle)
    index = load_gold_index(gold_root, gold_index_path, refresh=refresh_gold)
    gold = find_gold_match(generated, index)
    result = compare_bundles(
        generated,
        gold,
        lint_result=lint_result,
        semantic_judge=semantic_judge,
        require_lint=require_lint,
    )
    if run_dir:
        wf_dir = workflow_dir(run_dir)
        wf_dir.mkdir(parents=True, exist_ok=True)
        (wf_dir / "ingest_score.json").write_text(
            json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        write_workflow_report(
            run_dir,
            "Engram Ingest Score",
            [
                f"- Status: {result['status']}",
                f"- Gold: {result['gold']['title']}",
                f"- Fact recall: {result['metrics']['factRecall']}",
                f"- Symbol recall: {result['metrics']['symbolRecall']}",
                f"- Symbol precision: {result['metrics']['symbolPrecision']}",
                f"- Meaning similarity: {result['metrics']['meaningSimilarity']}",
            ],
        )
    return result


def cmd_score(args: argparse.Namespace) -> int:
    run_dir = args.run_dir.resolve() if args.run_dir else None
    generated_bundle = args.generated_bundle or (
        infer_bundle_from_run(run_dir) if run_dir else None
    )
    if generated_bundle is None:
        print("pass --run-dir or --generated-bundle", file=sys.stderr)
        return 2
    require_lint = run_dir is not None and not args.allow_missing_lint
    result = score_run(
        run_dir=run_dir,
        generated_bundle=generated_bundle.resolve(),
        gold_root=args.gold_root,
        gold_index_path=args.gold_index,
        refresh_gold=args.refresh_gold,
        semantic_judge=args.semantic_judge,
        require_lint=require_lint,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["status"] == "pass" else 1


def cmd_run(args: argparse.Namespace) -> int:
    prep = argparse.Namespace(
        video=args.video, out_root=args.out_root, skip_mvs=args.skip_mvs
    )
    code = cmd_prepare(prep)
    if code != 0:
        return code
    run_dir = args.out_root / slugify(args.video.stem)
    draft = run_dir / "draft_symbols.json"
    draft_data = read_json_if_exists(draft, {"symbols": []})
    if not draft_data.get("symbols"):
        print(
            json.dumps(
                {
                    "status": "needs_draft",
                    "runDir": str(run_dir),
                    "authorPacket": str(workflow_dir(run_dir) / "author_packet.md"),
                    "next": "Author draft_symbols.json, then run ingest_workflow.py build and score.",
                },
                indent=2,
            )
        )
        return 2
    build_args = argparse.Namespace(
        run_dir=run_dir,
        draft=draft,
        video=args.video,
        backdrop_index=args.backdrop_index,
    )
    code = cmd_build(build_args)
    if code != 0:
        return code
    score_args = argparse.Namespace(
        run_dir=run_dir,
        generated_bundle=None,
        gold_root=args.gold_root,
        gold_index=args.gold_index,
        refresh_gold=args.refresh_gold,
        semantic_judge=args.semantic_judge,
        allow_missing_lint=False,
    )
    return cmd_score(score_args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Engram ingest workflow and gold scoring."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("gold-index", help="Index read-only gold .engram.zip bundles.")
    p.add_argument("--gold-root", type=Path, default=DEFAULT_GOLD_ROOT)
    p.add_argument("--eval-root", type=Path, default=DEFAULT_EVAL_ROOT)
    p.add_argument("--cache", type=Path, default=None)
    p.add_argument(
        "--json",
        action="store_true",
        help="Print compact summary instead of full index.",
    )
    p.set_defaults(func=cmd_gold_index)

    p = sub.add_parser(
        "prepare", help="Prepare frames/transcript packet for Codex draft authoring."
    )
    p.add_argument("--video", type=Path, required=True)
    p.add_argument("--out-root", type=Path, default=DEFAULT_EVAL_ROOT)
    p.add_argument("--skip-mvs", action="store_true")
    p.set_defaults(func=cmd_prepare)

    p = sub.add_parser(
        "coverage",
        help="Write workflow/coverage_targets.json for an existing run dir (no re-extract).",
    )
    p.add_argument("--run-dir", type=Path, required=True)
    p.set_defaults(func=cmd_coverage)

    p = sub.add_parser("build", help="Lint draft_symbols.json and build the bundle.")
    p.add_argument("--run-dir", type=Path, required=True)
    p.add_argument("--draft", type=Path, default=None)
    p.add_argument("--video", type=Path, default=None)
    p.add_argument("--backdrop-index", type=int, default=None)
    p.set_defaults(func=cmd_build)

    p = sub.add_parser(
        "score", help="Score a generated bundle against the matching gold bundle."
    )
    p.add_argument("--run-dir", type=Path, default=None)
    p.add_argument("--generated-bundle", type=Path, default=None)
    p.add_argument("--gold-root", type=Path, default=DEFAULT_GOLD_ROOT)
    p.add_argument("--gold-index", type=Path, default=None)
    p.add_argument("--refresh-gold", action="store_true")
    p.add_argument("--semantic-judge", action="store_true")
    p.add_argument("--allow-missing-lint", action="store_true")
    p.set_defaults(func=cmd_score)

    p = sub.add_parser("run", help="Prepare, then build/score when a draft is present.")
    p.add_argument("--video", type=Path, required=True)
    p.add_argument("--out-root", type=Path, default=DEFAULT_EVAL_ROOT)
    p.add_argument("--gold-root", type=Path, default=DEFAULT_GOLD_ROOT)
    p.add_argument("--gold-index", type=Path, default=None)
    p.add_argument("--refresh-gold", action="store_true")
    p.add_argument("--semantic-judge", action="store_true")
    p.add_argument("--skip-mvs", action="store_true")
    p.add_argument("--backdrop-index", type=int, default=None)
    p.set_defaults(func=cmd_run)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:
        print(
            json.dumps({"status": "error", "error": str(exc)}, indent=2),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
