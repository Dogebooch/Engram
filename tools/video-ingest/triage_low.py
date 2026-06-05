"""One-off triage of the `low` and `blank_backdrop` audit buckets.

Aggregates the already-computed lint signal on disk
(`{slug}/workflow/lint_result.json`) so we can split the `low` bundles into
under-extracted (re-ingest), legitimately-small (leave alone), and borderline
(needs a semantic spot-check) without paying for any model calls.

Reads the audit produced by the structural audit pass and writes
`_triage-<date>/triage.json` next to the run dirs.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

RUNS_ROOT = Path(r"P:\Python Projects\Engram\video-ingest-runs")


def load_lint(slug: str) -> dict[str, Any] | None:
    run_dir = RUNS_ROOT / slug / "workflow"
    for name in ("lint_result.json", "codex_lint_verify.json"):
        path = run_dir / name
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


def warning_codes(lint: dict[str, Any]) -> list[str]:
    return [
        w["code"]
        for w in lint.get("warnings", [])
        if isinstance(w, dict) and w.get("code")
    ]


def enrich(entry: dict[str, Any]) -> dict[str, Any]:
    """Attach lint-derived fields to an audit entry."""
    lint = load_lint(entry["slug"])
    stats = (lint or {}).get("stats", {})
    codes = warning_codes(lint) if lint else []
    return {
        "videoId": entry.get("videoId"),
        "slug": entry["slug"],
        "course": entry.get("course"),
        "symbols": stats.get("symbols", entry.get("symbols")),
        "segments": stats.get("segments"),
        "ocr_coverage": stats.get("ocr_coverage"),
        "missing_terms": stats.get("missing_terms") or [],
        "warning_codes": codes,
        "lint_found": lint is not None,
        "bd_std": entry.get("bd_std"),
        "bd_mean": entry.get("bd_mean"),
    }


def classify(rec: dict[str, Any]) -> str:
    """Mirror lint_draft.py's dense-floor / completeness thresholds."""
    if not rec["lint_found"]:
        # No lint signal on disk -> can't judge cheaply; send to spot-check.
        return "borderline"

    under_flag = "possible-under-extraction" in rec["warning_codes"]
    cov = rec["ocr_coverage"]
    segs = rec["segments"] or 0
    missing = rec["missing_terms"]

    # Clear under-extraction: flagged, has named missing terms, and either very
    # low coverage or a dense transcript (the lint dense-floor regime).
    if under_flag and missing and ((cov is not None and cov < 0.70) or segs >= 250):
        return "under_extracted"

    # Clear legit-small: no flag and high coverage.
    if not under_flag and cov is not None and cov >= 0.90:
        return "legit_small"

    return "borderline"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--audit",
        type=Path,
        default=RUNS_ROOT / "_audit_20260604.json",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=RUNS_ROOT / "_triage-20260604",
    )
    args = parser.parse_args()

    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    low = audit.get("low", [])
    blanks = audit.get("blank_backdrop", [])

    buckets: dict[str, list[dict[str, Any]]] = {
        "under_extracted": [],
        "legit_small": [],
        "borderline": [],
        "blank_backdrop": [],
    }

    for entry in low:
        rec = enrich(entry)
        buckets[classify(rec)].append(rec)

    for entry in blanks:
        buckets["blank_backdrop"].append(enrich(entry))

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "triage.json").write_text(
        json.dumps(buckets, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    counts = {k: len(v) for k, v in buckets.items()}
    missing_lint = sum(1 for b in buckets.values() for r in b if not r["lint_found"])
    print(json.dumps({"counts": counts, "missing_lint": missing_lint}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
