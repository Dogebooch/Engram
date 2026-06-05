r"""Deterministic pre-build check for an agent-authored draft_symbols.json.

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

import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

REQUIRED_FIELDS = (
    "fact",
    "symbol_description",
    "meaning",
    "evidence",
    "timestamp_ms",
    "target_ids",
    "evidence_quote",
    "evidence_start_ms",
)
DENSE_SEGMENTS = 250  # mirrors ingest_queue.DENSE_SEGMENTS
GROUND_MIN_RATIO = 0.6  # a quote must overlap the transcript at least this much
LOCAL_EVIDENCE_WINDOW_MS = 15000
UNDER_EXTRACTION_FLOOR = (
    12  # dense transcripts almost always name more symbols than this
)
OCR_TERM_MIN_LEN = 4  # ignore short tokens when matching on-screen labels
OCR_MIN_TERMS = 6  # below this, OCR∩transcript is too small to trust coverage
OCR_COVERAGE_FLOOR = (
    0.80  # just below the known-good range (min 0.833 over 11 ready bundles)
)
VALID_OMISSION_REASONS = frozenset(
    {
        "not-visible-on-backdrop",
        "panning-scene",
        "duplicate-title",
        "not-mnemonic-fact",
        "ocr-noise",
        "outside-scope",
    }
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
EVIDENCE_FORMAT_RE = re.compile(r"^Transcript\s+@\d+:\d{2}\s+[\"“”']")
MNEMONIC_SIGNAL_RE = re.compile(
    r"(=|\bsounds? like\b|\bencodes?\b|\brepresents?\b|\bsymboli[sz]es?\b|"
    r"\breminds?\b|\bclues?\b|\bstands for\b|\bmeans\b|\brecurring symbol\b|"
    r"\bmnemonic\b|\bphonetic\b|\bpoints?\b|\bfacing\b|\blabeled\b)",
    re.IGNORECASE,
)
FILLER_QUOTE_RE = re.compile(
    r"^(you know|by the way|anyways|anyway|now that i think about it)\b",
    re.IGNORECASE,
)
TRUNCATED_END_TOKENS = frozenset(
    {
        "a",
        "an",
        "and",
        "as",
        "can",
        "cranial",
        "for",
        "in",
        "lateral",
        "of",
        "or",
        "superior",
        "the",
        "to",
        "would",
        "you",
    }
)
BANNED_CHARS = ("≈", "→", "≤", "≥")
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
SYMBOL_OVERLAP_STOPWORDS = frozenset(
    {
        "anterior",
        "antelope",
        "center",
        "flags",
        "guest",
        "monkey",
        "motor",
        "nerve",
        "nucleus",
        "orbit",
        "person",
        "ride",
        "sick",
        "sign",
        "spinning",
        "super",
        "tourist",
        "water",
    }
)
FACT_SIGNAL_RE = re.compile(
    r"\b(is|are|causes?|caused|carries|innervates?|originates?|exits?|passes|"
    r"involved|stabili[sz]es?|treats?|used|inhibits?|activates?|blocks?|"
    r"increases?|decreases?|stimulates?|associated|located|leads?|results?|"
    r"presents?|diagnosed|contraindicated|side effects?|adverse|deficiency|excess)\b",
    re.IGNORECASE,
)
WEAK_FACT_LABEL_RE = re.compile(r"\b(title|name|nickname|anchor|cue|target|label)\b", re.IGNORECASE)


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


def coerce_ms(value: object) -> int | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if 0 < numeric < 10000 and not str(value).isdigit():
        numeric *= 1000
    return int(numeric)


def segment_start_ms(seg: dict) -> int:
    return coerce_ms(seg.get("start_ms")) or coerce_ms(seg.get("start")) or 0


def segment_end_ms(seg: dict) -> int:
    return coerce_ms(seg.get("end_ms")) or coerce_ms(seg.get("end")) or segment_start_ms(seg)


def transcript_window_tokens(segs: list[dict], start_ms: int) -> list[str]:
    texts = []
    for seg in segs:
        s = segment_start_ms(seg)
        e = segment_end_ms(seg)
        if abs(s - start_ms) <= LOCAL_EVIDENCE_WINDOW_MS or s <= start_ms <= e + LOCAL_EVIDENCE_WINDOW_MS:
            texts.append(clean(seg.get("text")))
    if not texts and segs:
        nearest = min(segs, key=lambda seg: abs(segment_start_ms(seg) - start_ms))
        texts.append(clean(nearest.get("text")))
    return norm(" ".join(texts)).split()


def read_json_if_exists(path: Path, default: object) -> object:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def clean_id_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [clean(v) for v in value if clean(v)]


def has_required_value(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(clean(value))
    if isinstance(value, list):
        return bool(value)
    return True


def significant_fact_terms(value: str) -> list[str]:
    return [
        token
        for token in norm(value).split()
        if len(token) >= 3 and token not in STOPWORDS
    ]


def canonical_tokens(value: str) -> set[str]:
    return {CRITICAL_TERM_ALIASES.get(token, token) for token in norm(value).split()}


def quote_looks_truncated(quote: str) -> bool:
    quote = clean(quote)
    if not quote:
        return False
    quote_tokens = norm(quote).split()
    return bool(quote_tokens and quote_tokens[-1] in TRUNCATED_END_TOKENS)


def primary_symbol_terms(symbols: list[dict]) -> dict[int, set[str]]:
    result: dict[int, set[str]] = {}
    for idx, sym in enumerate(symbols):
        key = clean(sym.get("symbol_key")) if isinstance(sym, dict) else ""
        terms = {
            token
            for token in norm(key).split()
            if len(token) >= 5 and token not in SYMBOL_OVERLAP_STOPWORDS
        }
        result[idx] = terms
    return result


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
    transcript_segments: list[dict] = []
    seg_count = 0
    tpath = run_dir / "transcript.json"
    if tpath.exists():
        t = json.loads(tpath.read_text(encoding="utf-8"))
        segs = t.get("segments", []) if isinstance(t, dict) else []
        transcript_segments = [s for s in segs if isinstance(s, dict)]
        seg_count = len(transcript_segments)
        transcript_tokens = norm(" ".join(clean(s.get("text")) for s in transcript_segments)).split()
    if not transcript_tokens:
        errors.append(
            {
                "code": "transcript-unavailable",
                "msg": "no transcript tokens; evidence grounding cannot be verified",
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

    coverage_path = run_dir / "workflow" / "coverage_targets.json"
    if not coverage_path.exists():
        errors.append(
            {
                "code": "coverage-targets-unavailable",
                "msg": f"missing deterministic coverage target file: {coverage_path}",
            }
        )
    coverage_data = read_json_if_exists(coverage_path, {"targets": []})
    raw_targets = coverage_data.get("targets", []) if isinstance(coverage_data, dict) else []
    targets = {
        clean(t.get("target_id")): t
        for t in raw_targets
        if isinstance(t, dict) and clean(t.get("target_id")) and t.get("required", True)
    }
    if coverage_path.exists() and not targets:
        errors.append(
            {
                "code": "no-coverage-targets",
                "msg": "coverage_targets.json has no required targets; prepare cannot prove extraction completeness",
            }
        )
    covered_targets: set[str] = set()
    symbols_by_target: dict[str, list[dict]] = {}

    omissions = draft.get("omissions", []) if isinstance(draft, dict) else []
    if omissions is None:
        omissions = []
    if not isinstance(omissions, list):
        errors.append({"code": "bad-omissions", "msg": "omissions must be a list"})
        omissions = []
    omitted_targets: set[str] = set()
    for idx, omission in enumerate(omissions):
        if not isinstance(omission, dict):
            errors.append({"order": idx, "code": "bad-omission", "msg": "omission is not an object"})
            continue
        target_id = clean(omission.get("target_id"))
        reason = clean(omission.get("reason"))
        cue = clean(omission.get("quote") or omission.get("cue") or omission.get("text"))
        if not target_id:
            errors.append({"order": idx, "code": "invalid-omission", "msg": "omission missing target_id"})
            continue
        if target_id not in targets:
            errors.append({"order": idx, "target_id": target_id, "code": "invalid-omission", "msg": "unknown target_id"})
        if reason not in VALID_OMISSION_REASONS:
            errors.append(
                {
                    "order": idx,
                    "target_id": target_id,
                    "code": "invalid-omission",
                    "msg": f"invalid omission reason: {reason}",
                }
            )
        if not cue:
            errors.append({"order": idx, "target_id": target_id, "code": "invalid-omission", "msg": "omission missing quote/cue text"})
        omitted_targets.add(target_id)

    grounded = ungrounded = missing_key = 0
    seen_bullets: dict[tuple, object] = {}
    key_terms_by_index = primary_symbol_terms([s for s in symbols if isinstance(s, dict)])

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
            if not has_required_value(sym.get(field)):
                errors.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "missing-field",
                        "msg": f"empty required field: {field}",
                    }
                )

        generated_text = " ".join(
            clean(sym.get(field))
            for field in (
                "fact",
                "symbol_description",
                "meaning",
                "evidence",
                "evidence_quote",
                "symbol_key",
            )
        )
        for char in BANNED_CHARS:
            if char in generated_text:
                errors.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "banned-character",
                        "msg": f"generated text contains banned house-style character: {char}",
                    }
                )

        target_ids = clean_id_list(sym.get("target_ids"))
        if not target_ids:
            errors.append(
                {
                    "order": order,
                    "symbol_key": ref,
                    "code": "missing-target-ids",
                    "msg": "symbol must name at least one coverage target_id",
                }
            )
        for target_id in target_ids:
            if targets and target_id not in targets:
                errors.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "target_id": target_id,
                        "code": "unknown-target-id",
                        "msg": f"target_id not found in coverage_targets.json: {target_id}",
                    }
                )
            covered_targets.add(target_id)
            symbols_by_target.setdefault(target_id, []).append(sym)

        if not key:
            missing_key += 1

        fact_text = clean(sym.get("fact"))
        if WEAK_FACT_LABEL_RE.search(fact_text) or (
            not FACT_SIGNAL_RE.search(fact_text)
            and len(significant_fact_terms(fact_text)) < 5
        ):
            errors.append(
                {
                    "order": order,
                    "symbol_key": ref,
                    "code": "weak-fact",
                    "msg": f"fact must be a full board-relevant statement, not a cue label: {fact_text!r}",
                }
            )

        meaning_text = clean(sym.get("meaning"))
        meaning_terms = significant_fact_terms(meaning_text)
        if (
            "/" in meaning_text
            or len(meaning_terms) < 4
            or not MNEMONIC_SIGNAL_RE.search(meaning_text)
        ):
            errors.append(
                {
                    "order": order,
                    "symbol_key": ref,
                    "code": "weak-meaning",
                    "msg": "meaning must explain the mnemonic encoding/why, not a bare label or slash list",
                }
            )

        evidence_text = clean(sym.get("evidence"))
        if evidence_text and not EVIDENCE_FORMAT_RE.search(evidence_text):
            errors.append(
                {
                    "order": order,
                    "symbol_key": ref,
                    "code": "bad-evidence-format",
                    "msg": 'evidence must start like: Transcript @m:ss "clean quote"',
                }
            )

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
            quote = clean(sym.get("evidence_quote"))
            if not quote:
                quote = best_quote(clean(sym.get("evidence"))) or ""
            if not quote:
                errors.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "no-quote",
                        "msg": "evidence has no quoted span to verify against the transcript",
                    }
                )
            else:
                evidence_start = coerce_ms(sym.get("evidence_start_ms"))
                if evidence_start is None:
                    errors.append(
                        {
                            "order": order,
                            "symbol_key": ref,
                            "code": "bad-evidence-timestamp",
                            "msg": f"evidence_start_ms not an integer: {sym.get('evidence_start_ms')!r}",
                        }
                    )
                    local_tokens = transcript_tokens
                else:
                    local_tokens = transcript_window_tokens(transcript_segments, evidence_start)
                ratio = grounding_ratio(quote, local_tokens)
                if ratio >= GROUND_MIN_RATIO:
                    grounded += 1
                else:
                    ungrounded += 1
                    errors.append(
                        {
                            "order": order,
                            "symbol_key": ref,
                            "code": "ungrounded-evidence",
                            "msg": f'quoted evidence not near evidence_start_ms (overlap {ratio:.2f}): "{quote[:60]}"',
                        }
                    )
                quote_norm = norm(quote)
                if FILLER_QUOTE_RE.search(quote_norm) or quote_looks_truncated(quote):
                    errors.append(
                        {
                            "order": order,
                            "symbol_key": ref,
                            "code": "bad-evidence-fragment",
                            "msg": f"evidence_quote is filler-heavy or ends mid-sentence: {quote[:80]!r}",
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

        description_tokens = canonical_tokens(clean(sym.get("symbol_description")))
        for other_idx, terms in key_terms_by_index.items():
            if other_idx == idx:
                continue
            other = symbols[other_idx] if other_idx < len(symbols) and isinstance(symbols[other_idx], dict) else {}
            if clean(other.get("symbol_key")) == key:
                continue
            overlap = sorted(term for term in terms if term in description_tokens)
            if overlap:
                warnings.append(
                    {
                        "order": order,
                        "symbol_key": ref,
                        "code": "suspicious-symbol-overlap",
                        "msg": f"symbol_description appears to include another symbol object: {', '.join(overlap)}",
                    }
                )
                break

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
    omitted_terms = {
        term
        for target_id in omitted_targets
        for term in clean_id_list((targets.get(target_id) or {}).get("required_terms"))
    }
    draft_set = set(
        norm(
            " ".join(
                clean(s.get(f))
                for s in symbols
                if isinstance(s, dict)
                for f in ("fact", "meaning", "symbol_description", "symbol_key")
            )
        ).split()
    ) | omitted_terms
    missing_terms = [t for t in ocr_terms if t not in draft_set]
    ocr_coverage = (
        round((len(ocr_terms) - len(missing_terms)) / len(ocr_terms), 3)
        if ocr_terms
        else None
    )

    if seg_count >= DENSE_SEGMENTS and len(symbols) < UNDER_EXTRACTION_FLOOR:
        errors.append(
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
        errors.append(
            {
                "code": "possible-under-extraction",
                "msg": f"ocr_coverage {ocr_coverage:.2f} (<{OCR_COVERAGE_FLOOR}); on-screen labels not in draft: {', '.join(missing_terms[:8])}",
            }
        )

    uncovered_targets = sorted(set(targets) - covered_targets - omitted_targets)
    for target_id in uncovered_targets:
        target = targets[target_id]
        errors.append(
            {
                "code": "uncovered-target",
                "target_id": target_id,
                "source": clean(target.get("source")),
                "start_ms": target.get("start_ms"),
                "msg": f"coverage target not represented or omitted: {clean(target.get('text'))[:100]}",
            }
        )

    missing_critical_terms: list[dict] = []
    for target_id, target in targets.items():
        if target_id in omitted_targets or target_id in uncovered_targets:
            continue
        critical_terms = [
            CRITICAL_TERM_ALIASES.get(term, term)
            for term in clean_id_list(target.get("critical_terms"))
        ]
        if not critical_terms:
            continue
        linked = symbols_by_target.get(target_id, [])
        linked_text = " ".join(
            clean(sym.get(field))
            for sym in linked
            for field in ("fact", "meaning", "evidence", "evidence_quote")
        )
        linked_tokens = canonical_tokens(linked_text)
        missing = [term for term in critical_terms if term not in linked_tokens]
        if missing:
            missing_critical_terms.append({"target_id": target_id, "missing": missing})
            errors.append(
                {
                    "code": "missing-critical-terms",
                    "target_id": target_id,
                    "source": clean(target.get("source")),
                    "missing": missing,
                    "msg": f"linked symbol text misses high-yield terms: {', '.join(missing)}",
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
            "coverage_targets": len(targets),
            "coverage_covered": len(covered_targets & set(targets)),
            "coverage_omitted": len(omitted_targets & set(targets)),
            "coverage_uncovered": len(uncovered_targets),
            "uncovered_targets": uncovered_targets[:25],
            "missing_critical_terms": missing_critical_terms[:25],
        },
    }


def main() -> int:
    p = argparse.ArgumentParser(
        description="Lint an agent-authored draft_symbols.json before building."
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
