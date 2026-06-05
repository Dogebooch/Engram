"""Combine the deterministic triage buckets with spot-check verdicts into the
re-ingest deliverable the user feeds to Codex.

rebuildSet = under_extracted(clear from lint) + borderline(spot-check-confirmed)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

OUT = Path(r"P:\Python Projects\Engram\video-ingest-runs\_triage-20260604")


def fmt_cov(v: Any) -> str:
    return f"{v:.2f}" if isinstance(v, (int, float)) else "-"


def fmt_terms(terms: list[str]) -> str:
    return ", ".join(terms) if terms else "-"


def main() -> int:
    triage = json.loads((OUT / "triage.json").read_text(encoding="utf-8"))
    spot = json.loads((OUT / "spotcheck.json").read_text(encoding="utf-8"))

    by_slug = {r["slug"]: r for bucket in triage.values() for r in bucket}
    spot_missing = {e["slug"]: e["missing"] for e in spot["under_extracted"]}

    # rebuildSet: clear under-extracted + spot-check-confirmed borderline.
    rebuild: list[dict[str, Any]] = []
    for r in triage["under_extracted"]:
        rebuild.append({**r, "source": "lint", "hint_terms": r["missing_terms"]})
    for slug, missing in spot_missing.items():
        r = by_slug[slug]
        rebuild.append({**r, "source": "haiku-spotcheck", "hint_terms": missing})

    rebuild.sort(key=lambda r: (r.get("course") or "", r["slug"]))

    # leave-alone: legit_small + borderline NOT confirmed under-extracted.
    leave = list(triage["legit_small"])
    leave += [r for r in triage["borderline"] if r["slug"] not in spot_missing]
    leave.sort(key=lambda r: (r.get("course") or "", r["slug"]))

    blanks = sorted(triage["blank_backdrop"], key=lambda r: r["slug"])

    # ---- rebuild_list.json ----
    (OUT / "rebuild_list.json").write_text(
        json.dumps(
            {"videoIds": [r["videoId"] for r in rebuild], "items": rebuild},
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # ---- rebuild_list.md ----
    ids = " ".join(str(r["videoId"]) for r in rebuild)
    lines = [
        "# Re-ingest list — under-extracted bundles",
        "",
        f"{len(rebuild)} bundles to re-ingest via Codex "
        f"({len(triage['under_extracted'])} flagged by lint + "
        f"{len(spot_missing)} confirmed by spot-check of the borderline set).",
        "",
        "**videoIds (copy/paste):**",
        "",
        f"`{ids}`",
        "",
        "| videoId | slug | course | symbols | segments | ocr_cov | completeness hints (missing) |",
        "|--:|---|---|--:|--:|--:|---|",
    ]
    for r in rebuild:
        lines.append(
            f"| {r['videoId']} | {r['slug']} | {r.get('course') or '?'} | "
            f"{r.get('symbols')} | {r.get('segments') if r.get('segments') is not None else '-'} | "
            f"{fmt_cov(r.get('ocr_coverage'))} | {fmt_terms(r['hint_terms'])} |"
        )
    snap_lines = "\n".join(
        rf"Copy-Item '$runs\{r['slug']}\{r['slug']}.engram.zip' $snap -Force"
        for r in rebuild
    )
    lines += [
        "",
        "## How to re-ingest through the canonical Codex runner",
        "",
        "Target these by **explicit videoId** — do NOT use the runner's `--max-videos`, "
        "which just pulls the next pending videos in queue order (the wrong set). The "
        "explicit-id entrypoint is `codex_ingest_batch.py plan --ids ...`; it resolves these "
        "videos, prepares their run dirs, and emits a job manifest. The author ladder "
        "(`gpt-5.4 -> gpt-5.5`) plus `build_critique()` (which feeds the missing "
        "terms back to the author) then targets the gaps.",
        "",
        "```powershell",
        r"$runs = 'P:\Python Projects\Engram\video-ingest-runs'",
        "",
        "# 1. snapshot the current zips first (reversible rollback)",
        r"$snap = Join-Path $runs '_pre-rebuild-20260604'",
        "New-Item -ItemType Directory -Force $snap | Out-Null",
        snap_lines,
        "",
        "# 2. prepare explicit jobs for exactly these 24 ids:",
        "python tools\\video-ingest\\codex_ingest_batch.py plan --ids "
        + " ".join(str(r["videoId"]) for r in rebuild),
        "",
        "# 3. run the prepared jobs the same way the overnight batch did, then:",
        r"python tools\video-ingest\codex_ingest_batch.py verify   # rerun lint/import checks",
        r"python tools\video-ingest\codex_ingest_batch.py finalize  # update ready/flag state",
        "```",
    ]
    (OUT / "rebuild_list.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ---- leave_alone.md ----
    la = [
        "# Left alone — legitimately small scenes",
        "",
        f"{len(leave)} `low` bundles judged complete (small scene is correct) and NOT re-ingested.",
        "",
        "| videoId | slug | course | symbols | ocr_cov |",
        "|--:|---|---|--:|--:|",
    ]
    for r in leave:
        la.append(
            f"| {r['videoId']} | {r['slug']} | {r.get('course') or '?'} | "
            f"{r.get('symbols')} | {fmt_cov(r.get('ocr_coverage'))} |"
        )
    (OUT / "leave_alone.md").write_text("\n".join(la) + "\n", encoding="utf-8")

    # ---- blank_backdrops.md ----
    bb = [
        "# Blank backdrops — backdrop fix, NOT re-author",
        "",
        "Symbols are fine; the backdrop image decoded to black (likely a `.mov` "
        "decode-to-black). Re-pick a good frame with `--backdrop-index N` or swap it "
        "in-editor. Do NOT run these through the authoring ladder.",
        "",
        "| videoId | slug | course | symbols | bd_std | bd_mean |",
        "|--:|---|---|--:|--:|--:|",
    ]
    for r in blanks:
        bb.append(
            f"| {r['videoId']} | {r['slug']} | {r.get('course') or '?'} | "
            f"{r.get('symbols')} | {fmt_cov(r.get('bd_std'))} | {fmt_cov(r.get('bd_mean'))} |"
        )
    (OUT / "blank_backdrops.md").write_text("\n".join(bb) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "rebuild": len(rebuild),
                "leave_alone": len(leave),
                "blank_backdrops": len(blanks),
                "rebuild_videoIds": [r["videoId"] for r in rebuild],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

