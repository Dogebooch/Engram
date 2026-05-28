"""Unattended batch extraction over a folder of videos.

Runs the expensive, non-interactive stage (keyframes + transcript) for every
video so the interactive per-video loop (author symbols -> SAM -> build) has
zero transcription. Idempotent and resumable: already-extracted runs are
skipped unless --force, and one video's failure never aborts the batch.

Does NOT author symbols or build bundles (those are the interactive step).
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from captions import get_transcript
from ingest_video import (
    StageTimer,
    ensure_clean_dir,
    extract_keyframes,
    read_video_info,
    slugify,
    write_json,
)

VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".mov", ".m4v")


def discover_videos(folder: Path, exts: tuple[str, ...] = VIDEO_EXTS) -> list[Path]:
    return sorted(
        p for p in Path(folder).rglob("*") if p.is_file() and p.suffix.lower() in exts
    )


def is_extracted(out_dir: Path) -> bool:
    required = ("video_info.json", "keyframes.json", "transcript.json")
    return all(
        (out_dir / name).exists() and (out_dir / name).stat().st_size > 0
        for name in required
    )


def extract_one(
    video: Path,
    out_root: Path,
    whisper_model: str = "small.en",
    prefer_captions: bool = False,
    sample_seconds: float = 3.0,
    min_gap_seconds: float = 12.0,
    max_keyframes: int = 18,
    context_seconds: float = 2.0,
    diff_threshold: float = 0.08,
) -> dict[str, Any]:
    timer = StageTimer()
    info = read_video_info(video)
    out_dir = out_root / slugify(info.title)
    ensure_clean_dir(out_dir)
    write_json(out_dir / "video_info.json", asdict(info))

    with timer.time("keyframes"):
        keyframes = extract_keyframes(
            video=video,
            out_dir=out_dir,
            sample_seconds=sample_seconds,
            min_gap_seconds=min_gap_seconds,
            max_keyframes=max_keyframes,
            context_seconds=context_seconds,
            diff_threshold=diff_threshold,
        )
    write_json(out_dir / "keyframes.json", [asdict(k) for k in keyframes])

    with timer.time("transcript"):
        transcript = get_transcript(
            video, out_dir, whisper_model, prefer_captions=prefer_captions
        )
    write_json(out_dir / "transcript.json", transcript)

    timing = {
        "video": slugify(info.title),
        "stages": timer.stages,
        "transcript_source": transcript.get("source") or transcript.get("model"),
        "total": timer.total(),
    }
    write_json(out_dir / "timing.json", timing)
    return {
        "out_dir": str(out_dir),
        "n_keyframes": len(keyframes),
        "transcript_source": timing["transcript_source"],
        "seconds": timer.total(),
    }


def run_batch(
    folder: Path,
    out_root: Path,
    force: bool = False,
    **extract_opts: Any,
) -> dict[str, Any]:
    videos = discover_videos(folder)
    out_root.mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    extracted = skipped = failed = 0

    for video in videos:
        out_dir = out_root / slugify(video.stem)
        if not force and is_extracted(out_dir):
            skipped += 1
            items.append({"video": str(video), "status": "skipped"})
            print(f"[skip] {video.name}", flush=True)
            continue
        started = time.time()
        try:
            result = extract_one(video, out_root, **extract_opts)
            extracted += 1
            items.append({"video": str(video), "status": "ok", **result})
            print(
                f"[ok]   {video.name} ({result['seconds']}s, {result['transcript_source']})",
                flush=True,
            )
        except Exception as exc:  # boundary: per-video isolation
            failed += 1
            items.append(
                {
                    "video": str(video),
                    "status": "error",
                    "error": str(exc),
                    "seconds": round(time.time() - started, 2),
                }
            )
            print(f"[fail] {video.name}: {exc}", flush=True)

    summary = {
        "folder": str(folder),
        "total": len(videos),
        "extracted": extracted,
        "skipped": skipped,
        "failed": failed,
        "items": items,
    }
    write_json(out_root / "batch_summary.json", summary)
    md = [
        f"# Batch extract: {folder}",
        "",
        f"- Total: {len(videos)} | extracted: {extracted} | skipped: {skipped} | failed: {failed}",
        "",
    ]
    for item in items:
        md.append(
            f"- [{item['status']}] {Path(item['video']).name}"
            + (f" — {item.get('error')}" if item.get("error") else "")
        )
    (out_root / "batch_summary.md").write_text("\n".join(md), encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-extract a folder of videos.")
    parser.add_argument("--folder", required=True, type=Path)
    parser.add_argument("--out-root", required=True, type=Path)
    parser.add_argument("--whisper-model", default="small.en")
    parser.add_argument("--prefer-captions", action="store_true")
    parser.add_argument(
        "--force", action="store_true", help="Re-extract even if already done."
    )
    parser.add_argument("--max-keyframes", type=int, default=18)
    parser.add_argument("--sample-seconds", type=float, default=3.0)
    parser.add_argument("--min-gap-seconds", type=float, default=12.0)
    parser.add_argument("--context-seconds", type=float, default=2.0)
    parser.add_argument("--diff-threshold", type=float, default=0.08)
    args = parser.parse_args()

    summary = run_batch(
        folder=args.folder,
        out_root=args.out_root,
        force=args.force,
        whisper_model=args.whisper_model,
        prefer_captions=args.prefer_captions,
        max_keyframes=args.max_keyframes,
        sample_seconds=args.sample_seconds,
        min_gap_seconds=args.min_gap_seconds,
        context_seconds=args.context_seconds,
        diff_threshold=args.diff_threshold,
    )
    print(
        json.dumps(
            {k: summary[k] for k in ("total", "extracted", "skipped", "failed")},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
