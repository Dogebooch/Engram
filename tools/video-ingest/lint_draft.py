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
OCR_TERM_MIN_LEN = 4  # ignore short tokens when matching on-screen labels
OCR_MIN_TERMS = 6  # below this, OCR∩transcript is too small to trust coverage
OCR_COVERAGE_FLOOR = (
    0.80  # just below the known-good range (min 0.833 over 11 ready bundles)
)

# Common >=4-char English words that survive the OCR∩transcript intersection but
# carry no completeness signal. Brand/watermark tokens (Pixorize, v1.0.0, ...) are
# dropped by the intersection itself — they are not spoken — so only generic fillers
# that ARE spoken belong here.
STOPWORDS = frozenset(
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
        "they",
        "well",
    }
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


def load_coverage_targets(run_dir: Path) -> dict[str, dict]:
    path = run_dir / "workflow" / "coverage_targets.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    targets = data.get("targets", []) if isinstance(data, dict) else []
    return {
        clean(target.get("target_id")): target
        for target in targets
        if isinstance(target, dict) and clean(target.get("target_id"))
    }


def as_id_list(value: object) -> list[str]:
    if isinstance(value, str):
        return [clean(value)] if clean(value) else []
    if isinstance(value, list):
        return [clean(item) for item in value if clean(item)]
    return []


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

    ocr_tokens: list[str] = []
    opath = run_dir / "ocr.json"
    if opath.exists():
        o = json.loads(opath.read_text(encoding="utf-8"))
        osegs = o.get("segments", []) if isinstance(o, dict) else []
        ocr_tokens = norm(" ".join(clean(s.get("text")) for s in osegs)).split()

    duration_ms = 0
    vpath = run_dir / "video_info.json"
    if vpath.exists():
        vi = json.loads(vpath.read_text(encoding="utf-8"))
        duration_ms = int(vi.get("duration_ms") or 0)

    coverage_targets = load_coverage_targets(run_dir)
    required_target_ids = {
        target_id
        for target_id, target in coverage_targets.items()
        if target.get("required", True)
    }
    covered_target_ids: set[str] = set()
    target_symbols: dict[str, list[dict]] = {}
    omissions = draft.get("omissions", []) if isinstance(draft, dict) else []
    omitted_target_ids: set[str] = set()
    if isinstance(omissions, list):
        for idx, omission in enumerate(omissions):
            if not isinstance(omission, dict):
                errors.append(
                    {
                        "order": idx,
                        "code": "bad-omission",
                        "msg": "omission is not an object",
                    }
                )
                continue
            target_id = clean(omission.get("target_id"))
            if not target_id:
                errors.append(
                    {
                        "order": idx,
                        "code": "missing-target-ids",
                        "msg": "omission missing target_id",
                    }
                )
                continue
            if coverage_targets and target_id not in coverage_targets:
                errors.append(
                    {
                        "order": idx,
                        "code": "unknown-target-id",
                        "target_id": target_id,
                        "msg": f"omission references unknown target_id: {target_id}",
                    }
                )
                continue
            if not clean(omission.get("reason")):
                errors.append(
                    {
                        "order": idx,
                        "code": "missing-field",
                        "target_id": target_id,
                        "msg": "omission missing reason",
                    }
                )
            omitted_target_ids.add(target_id)

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

        target_ids = as_id_list(sym.get("target_ids"))
        if required_target_ids and not target_ids:
            warnings.append(
                {
                    "order": order,
                    "symbol_key": ref,
                    "code": "unlinked-symbol",
                    "msg": "symbol has no target_ids; allowed only as a grounded supplemental symbol beyond generated coverage targets",
                }
            )
        for target_id in target_ids:
            if coverage_targets and target_id not in coverage_targets:
                errors.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "unknown-target-id",
                        "target_id": target_id,
                        "msg": f"symbol references unknown target_id: {target_id}",
                    }
                )
                continue
            if target_id in required_target_ids:
                covered_target_ids.add(target_id)
                target_symbols.setdefault(target_id, []).append(sym)

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

    # OCR completeness: terms that are BOTH on-screen (ocr.json) and spoken
    # (transcript) are the real answer key; watermarks/garble aren't spoken and
    # drop out of the intersection. ocr_coverage is the fraction of those terms
    # the draft actually captured.
    transcript_set = set(transcript_tokens)
    ocr_terms = sorted(
        t
        for t in set(ocr_tokens) & transcript_set
        if len(t) >= OCR_TERM_MIN_LEN and t not in STOPWORDS
    )
    draft_set = set(
        norm(
            " ".join(
                clean(s.get(f))
                for s in symbols
                if isinstance(s, dict)
                for f in ("fact", "meaning", "symbol_description", "symbol_key")
            )
        ).split()
    )
    missing_terms = [t for t in ocr_terms if t not in draft_set]
    ocr_coverage = (
        round((len(ocr_terms) - len(missing_terms)) / len(ocr_terms), 3)
        if ocr_terms
        else None
    )

    if seg_count >= DENSE_SEGMENTS and len(symbols) < UNDER_EXTRACTION_FLOOR:
        warnings.append(
            {
                "code": "possible-under-extraction",
                "msg": f"dense transcript ({seg_count} segs) but only {len(symbols)} symbols; check for dropped symbols",
            }
        )
    if (
        OCR_COVERAGE_FLOOR is not None
        and len(ocr_terms) >= OCR_MIN_TERMS
        and ocr_coverage is not None
        and ocr_coverage < OCR_COVERAGE_FLOOR
    ):
        warnings.append(
            {
                "code": "possible-under-extraction",
                "msg": f"ocr_coverage {ocr_coverage:.2f} (<{OCR_COVERAGE_FLOOR}); on-screen labels not in draft: {', '.join(missing_terms[:8])}",
            }
        )

    missing_critical_terms: list[dict] = []
    for target_id in sorted(covered_target_ids):
        target = coverage_targets.get(target_id, {})
        critical_terms = [
            clean(term)
            for term in target.get("critical_terms", [])
            if clean(term)
        ]
        if not critical_terms:
            continue
        combined = norm(
            " ".join(
                clean(sym.get(field))
                for sym in target_symbols.get(target_id, [])
                for field in ("fact", "meaning", "evidence", "symbol_description")
            )
        )
        combined_tokens = set(combined.split())
        missing = [
            term
            for term in critical_terms
            if not set(norm(term).split()).issubset(combined_tokens)
        ]
        if missing:
            missing_critical_terms.append(
                {"target_id": target_id, "missing_terms": missing}
            )

    uncovered_target_ids = sorted(
        required_target_ids - covered_target_ids - omitted_target_ids
    )
    if uncovered_target_ids:
        errors.append(
            {
                "code": "uncovered-target",
                "msg": f"required coverage targets not represented or omitted: {', '.join(uncovered_target_ids[:12])}",
                "target_ids": uncovered_target_ids[:25],
            }
        )
    if missing_critical_terms:
        errors.append(
            {
                "code": "missing-critical-terms",
                "msg": "covered high-priority targets are missing critical terms",
                "targets": missing_critical_terms[:25],
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
            "ocr_terms": len(ocr_terms),
            "ocr_coverage": ocr_coverage,
            "missing_terms": missing_terms[:25],
            "coverage_targets": len(required_target_ids),
            "coverage_covered": len(covered_target_ids),
            "coverage_omitted": len(omitted_target_ids & required_target_ids),
            "coverage_uncovered": len(uncovered_target_ids),
            "uncovered_targets": uncovered_target_ids[:25],
            "missing_critical_terms": missing_critical_terms[:25],
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
