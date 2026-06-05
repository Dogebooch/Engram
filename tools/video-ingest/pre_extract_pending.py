"""Pre-extract frames + bake the MVS transcript for every pending ingest video.

The canonical Codex autopilot (`overnight_ingest_runner.py`) prepares each run
before launching one worker per video. This script performs the same CPU/DB work
up front in one batched pass, so workers can start straight from
`transcript.json`, `ocr.json`, keyframes, and deterministic coverage targets.

For each pending MVS video this writes the same run-dir artifacts a `--skip-transcript`
extract + `mvs_transcript.py` pass would (`video_info.json`, `keyframes.json`,
`transcript.json`, `ocr.json`, `frames/`), keyed by the STEM-based slug so
`ingest_video.py --reuse-run` and `ingest_queue.is_done` find them. It also records an
`engram_extraction` row in the MVS `search.db`, so extraction state lives next to the
`videos`/`segments` tables and `ingest_queue.py next` can report `framesReady`.

Idempotent and resumable: already-prepped run dirs are skipped unless --force, and one
video's failure never aborts the batch. Frame extraction runs in a thread pool; every
SQLite write happens on the main thread, so the MVS db never has two writers.

Usage:
  python pre_extract_pending.py --count 8
  python pre_extract_pending.py --all --workers 6
  python pre_extract_pending.py --video-ids 1212 1380 --force
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import datetime as dt
import json
import sqlite3
from dataclasses import asdict
from pathlib import Path

import ingest_queue
import mvs_transcript
from ingest_video import (
    ensure_clean_dir,
    extract_keyframes,
    read_video_info,
    write_json,
)
from ingest_workflow import write_coverage_targets

# Facts-only defaults (match the canonical autopilot's preparation path).
SAMPLE_SECONDS = 3.0
MIN_GAP_SECONDS = 12.0
MAX_KEYFRAMES = 18
CONTEXT_SECONDS = 2.0
DIFF_THRESHOLD = 0.08
# A static scene (common on Picmonic) defeats the diff sampler and yields <= 2 frames;
# re-extract a forced spread so the pre-extracted backdrop matches the in-loop one.
STATIC_KEYFRAME_THRESHOLD = 2
SPREAD_SAMPLE_SECONDS = 2.0
SPREAD_MIN_GAP_SECONDS = 3.0
SPREAD_DIFF_THRESHOLD = 0.0
SPREAD_MAX_KEYFRAMES = 18

EXTRACTION_DDL = """
CREATE TABLE IF NOT EXISTS engram_extraction (
    video_id INTEGER PRIMARY KEY,
    slug TEXT,
    run_dir TEXT,
    status TEXT,
    frames_ready INTEGER,
    keyframe_count INTEGER,
    backdrop_index INTEGER,
    transcript_segments INTEGER,
    ocr_segments INTEGER,
    keyframes_json TEXT,
    error TEXT,
    extracted_at TEXT
)
"""

UPSERT_SQL = """
INSERT INTO engram_extraction (
    video_id, slug, run_dir, status, frames_ready, keyframe_count, backdrop_index,
    transcript_segments, ocr_segments, keyframes_json, error, extracted_at
) VALUES (
    :video_id, :slug, :run_dir, :status, :frames_ready, :keyframe_count, :backdrop_index,
    :transcript_segments, :ocr_segments, :keyframes_json, :error, :extracted_at
)
ON CONFLICT(video_id) DO UPDATE SET
    slug=excluded.slug, run_dir=excluded.run_dir, status=excluded.status,
    frames_ready=excluded.frames_ready, keyframe_count=excluded.keyframe_count,
    backdrop_index=excluded.backdrop_index,
    transcript_segments=excluded.transcript_segments, ocr_segments=excluded.ocr_segments,
    keyframes_json=excluded.keyframes_json, error=excluded.error,
    extracted_at=excluded.extracted_at
"""


def connect_mvs(db: Path | None) -> sqlite3.Connection:
    conn = sqlite3.connect(db or ingest_queue.mvs_db())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def select_videos(conn: sqlite3.Connection, args: argparse.Namespace) -> list[dict]:
    """Resolve the videos to process: explicit --video-ids, or the live pending set."""
    out_root = ingest_queue.resolve_out_root(args)
    if args.video_ids:
        rows = [
            r for vid in args.video_ids if (r := ingest_queue.resolve_one(conn, vid))
        ]
    else:
        skips = {int(k) for k in ingest_queue.load_ledger()["skips"]}
        all_rows = ingest_queue.fetch_videos(conn, args.source, args.course)
        rows = [
            r
            for r in all_rows
            if int(r["id"]) not in skips
            and not ingest_queue.is_done(out_root, r["path"])
        ]
        if not args.all:
            rows = rows[: args.count]
    jobs: list[dict] = []
    for r in rows:
        path = r["path"]
        jobs.append(
            {
                "id": int(r["id"]),
                "source": r["source"],
                "course": r["course"],
                "title": r["title"],
                "path": path,
                "slug": ingest_queue.slugify(Path(path).stem),
                "out_dir": str(out_root / ingest_queue.slugify(Path(path).stem)),
                "transcript": mvs_transcript.transcript_segments(conn, int(r["id"])),
                "ocr": mvs_transcript.ocr_segments(conn, int(r["id"])),
            }
        )
    return jobs


def is_prepped(out_dir: Path) -> bool:
    jsons = ("video_info.json", "keyframes.json", "transcript.json", "ocr.json")
    if not all(
        (out_dir / n).exists() and (out_dir / n).stat().st_size > 0 for n in jsons
    ):
        return False
    frames = out_dir / "frames"
    return frames.is_dir() and any(frames.iterdir())


def keyframe_summary(keyframes: list[dict]) -> tuple[int, int | None, str]:
    backdrop = next(
        (k["index"] for k in keyframes if k.get("selected_as_backdrop")), None
    )
    compact = [
        {
            "index": k["index"],
            "timestamp_ms": k["timestamp_ms"],
            "image": k["image"],
            "selected_as_backdrop": k.get("selected_as_backdrop", False),
        }
        for k in keyframes
    ]
    return len(keyframes), backdrop, json.dumps(compact, ensure_ascii=False)


def write_transcript_files(out_dir: Path, job: dict) -> None:
    """Mirror mvs_transcript.py's transcript.json + ocr.json shape exactly."""
    segments = job["transcript"]
    write_json(
        out_dir / "transcript.json",
        {
            "status": "ok" if segments else "empty",
            "model": "mvs-index",
            "source": "medicine-video-searcher",
            "video": {
                "provider": "mvs",
                "id": job["id"],
                "title": job["title"],
                "path": job["path"],
                "source": job["source"],
                "course": job["course"],
            },
            "segments": segments,
        },
    )
    ocr = job["ocr"]
    write_json(
        out_dir / "ocr.json",
        {
            "status": "ok" if ocr else "empty",
            "model": "mvs-index",
            "source": "medicine-video-searcher",
            "segments": ocr,
        },
    )


def process_video(job: dict, force: bool, now: str) -> dict:
    """CPU + filesystem only -- no SQLite. Returns the engram_extraction row to upsert."""
    out_dir = Path(job["out_dir"])
    base = {
        "video_id": job["id"],
        "slug": job["slug"],
        "run_dir": str(out_dir),
        "transcript_segments": len(job["transcript"]),
        "ocr_segments": len(job["ocr"]),
        "error": None,
        "extracted_at": now,
    }

    if not force and is_prepped(out_dir):
        keyframes = json.loads((out_dir / "keyframes.json").read_text(encoding="utf-8"))
        count, backdrop, compact = keyframe_summary(keyframes)
        write_coverage_targets(out_dir)  # cheap + deterministic; backfills old run dirs
        return {
            **base,
            "outcome": "reused",
            "status": "ok" if job["transcript"] else "empty-transcript",
            "frames_ready": 1,
            "keyframe_count": count,
            "backdrop_index": backdrop,
            "keyframes_json": compact,
        }

    video_path = Path(job["path"])
    if not video_path.exists():
        return {
            **base,
            "outcome": "failed",
            "status": "failed",
            "frames_ready": 0,
            "keyframe_count": 0,
            "backdrop_index": None,
            "keyframes_json": None,
            "error": f"video file missing: {video_path}",
        }

    try:
        info = read_video_info(video_path)
        ensure_clean_dir(out_dir)
        write_json(out_dir / "video_info.json", asdict(info))
        keyframes = extract_keyframes(
            video=video_path,
            out_dir=out_dir,
            sample_seconds=SAMPLE_SECONDS,
            min_gap_seconds=MIN_GAP_SECONDS,
            max_keyframes=MAX_KEYFRAMES,
            context_seconds=CONTEXT_SECONDS,
            diff_threshold=DIFF_THRESHOLD,
            skip_context=True,
        )
        if len(keyframes) <= STATIC_KEYFRAME_THRESHOLD:
            keyframes = extract_keyframes(
                video=video_path,
                out_dir=out_dir,
                sample_seconds=SPREAD_SAMPLE_SECONDS,
                min_gap_seconds=SPREAD_MIN_GAP_SECONDS,
                max_keyframes=SPREAD_MAX_KEYFRAMES,
                context_seconds=CONTEXT_SECONDS,
                diff_threshold=SPREAD_DIFF_THRESHOLD,
                skip_context=True,
            )
        kf_dicts = [asdict(k) for k in keyframes]
        write_json(out_dir / "keyframes.json", kf_dicts)
        write_transcript_files(out_dir, job)
        write_coverage_targets(
            out_dir
        )  # deterministic lint targets from transcript+ocr
        count, backdrop, compact = keyframe_summary(kf_dicts)
        return {
            **base,
            "outcome": "extracted",
            "status": "ok" if job["transcript"] else "empty-transcript",
            "frames_ready": 1,
            "keyframe_count": count,
            "backdrop_index": backdrop,
            "keyframes_json": compact,
        }
    except Exception as exc:  # boundary: per-video isolation
        return {
            **base,
            "outcome": "failed",
            "status": "failed",
            "frames_ready": 0,
            "keyframe_count": 0,
            "backdrop_index": None,
            "keyframes_json": None,
            "error": str(exc),
        }


def upsert_row(conn: sqlite3.Connection, row: dict) -> None:
    params = {
        k: row[k]
        for k in (
            "video_id",
            "slug",
            "run_dir",
            "status",
            "frames_ready",
            "keyframe_count",
            "backdrop_index",
            "transcript_segments",
            "ocr_segments",
            "keyframes_json",
            "error",
            "extracted_at",
        )
    }
    conn.execute(UPSERT_SQL, params)
    conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-root", type=Path, default=None)
    parser.add_argument("--count", type=int, default=8)
    parser.add_argument("--source", type=str, default=None)
    parser.add_argument("--course", type=str, default=None)
    parser.add_argument("--video-ids", type=int, nargs="+", default=None)
    parser.add_argument(
        "--all", action="store_true", help="Process the entire pending set."
    )
    parser.add_argument(
        "--force", action="store_true", help="Re-extract already-prepped run dirs."
    )
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument(
        "--db", type=Path, default=None, help="Override MVS search.db path."
    )
    args = parser.parse_args()

    conn = connect_mvs(args.db)
    conn.execute(EXTRACTION_DDL)
    conn.commit()

    jobs = select_videos(conn, args)
    now = dt.datetime.now(dt.UTC).isoformat()
    rows: list[dict] = []
    counts = {"extracted": 0, "reused": 0, "failed": 0}

    with futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        pending = {
            pool.submit(process_video, job, args.force, now): job for job in jobs
        }
        for future in futures.as_completed(pending):
            row = future.result()
            upsert_row(conn, row)  # main-thread only -> single SQLite writer
            counts[row["outcome"]] += 1
            rows.append(row)
            tag = row["outcome"].upper()
            print(
                f"[{tag:9}] {row['slug']} ({row['keyframe_count']} kf)"
                + (f" -- {row['error']}" if row["error"] else ""),
                flush=True,
            )

    out_root = ingest_queue.resolve_out_root(args)
    summary = {
        "outRoot": str(out_root),
        "total": len(jobs),
        **counts,
        "videos": [
            {
                k: r[k]
                for k in (
                    "video_id",
                    "slug",
                    "outcome",
                    "status",
                    "keyframe_count",
                    "backdrop_index",
                    "error",
                )
            }
            for r in rows
        ],
    }
    out_root.mkdir(parents=True, exist_ok=True)
    write_json(out_root / "pre_extract_summary.json", summary)
    print(
        json.dumps(
            {k: summary[k] for k in ("total", "extracted", "reused", "failed")},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
