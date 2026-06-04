r"""Export a Medicine Video Searcher transcript as an Engram ingest transcript.json.

The Medicine Video Searcher desktop app indexes every video's Whisper transcript
into a local SQLite DB. For a video already in that library this pulls the stored
transcript (no re-transcription) and writes it in the exact shape
`ingest_video.py --reuse-run` consumes, so the ~60s Whisper stage drops to a DB read.
It also writes a sibling `ocr.json` (MVS's on-screen text, kind='ocr', with consecutive
duplicate frames collapsed) for use as a secondary completeness cross-check.

Usage (run after an extract-only `--skip-transcript` pass so the run dir exists):
  python mvs_transcript.py --run-dir <out-root>\<slug> --query "thiamine"
  python mvs_transcript.py --run-dir <out-root>\<slug> --path "P:\\Medicine Videos\\...\\x.mov"

Resolution is by exact --video-id, exact --path, or substring --query against the
MVS title/path. An ambiguous --query prints the candidates (exit 2) so you can
re-run with --video-id.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from pathlib import Path


def default_db() -> Path:
    env = os.environ.get("MVS_DB")
    if env:
        return Path(env)
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local) / "MedicineVideoSearcher" / "search.db"


def connect(db: Path) -> sqlite3.Connection:
    if not db.exists():
        raise FileNotFoundError(f"MVS database not found: {db}")
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    return conn


def resolve(
    conn: sqlite3.Connection,
    *,
    video_id: int | None,
    path: str | None,
    query: str | None,
) -> list[sqlite3.Row]:
    if video_id is not None:
        return conn.execute(
            "SELECT id, path, source, course, title FROM videos WHERE id = ?",
            (video_id,),
        ).fetchall()
    if path:
        return conn.execute(
            "SELECT id, path, source, course, title FROM videos WHERE path = ?", (path,)
        ).fetchall()
    if query:
        like = f"%{query.strip()}%"
        return conn.execute(
            "SELECT id, path, source, course, title FROM videos "
            "WHERE title LIKE ? OR path LIKE ? ORDER BY source, course, title",
            (like, like),
        ).fetchall()
    return []


def transcript_segments(conn: sqlite3.Connection, video_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT start_seconds, end_seconds, text FROM segments "
        "WHERE video_id = ? AND kind = 'transcript' ORDER BY start_seconds",
        (video_id,),
    ).fetchall()
    segments = []
    for r in rows:
        text = (r["text"] or "").strip()
        if not text:
            continue
        segments.append(
            {
                "start_ms": int(round((r["start_seconds"] or 0) * 1000)),
                "end_ms": int(round((r["end_seconds"] or 0) * 1000)),
                "text": text,
            }
        )
    return segments


def ocr_segments(conn: sqlite3.Connection, video_id: int) -> list[dict]:
    """On-screen text MVS scraped (kind='ocr'), with consecutive duplicate frames
    collapsed -- the same caption is OCR'd across many frames, so de-run it into a
    clean ordered list of distinct on-screen text for a completeness cross-check."""
    rows = conn.execute(
        "SELECT start_seconds, text FROM segments "
        "WHERE video_id = ? AND kind = 'ocr' ORDER BY start_seconds",
        (video_id,),
    ).fetchall()
    segments: list[dict] = []
    last_norm = None
    for r in rows:
        text = (r["text"] or "").strip()
        if not text:
            continue
        norm = " ".join(text.lower().split())
        if norm == last_norm:
            continue
        last_norm = norm
        segments.append(
            {"start_ms": int(round((r["start_seconds"] or 0) * 1000)), "text": text}
        )
    return segments


def main() -> int:
    p = argparse.ArgumentParser(description="Write transcript.json from the MVS index.")
    p.add_argument(
        "--run-dir", type=Path, help="Run dir; transcript.json is written here."
    )
    p.add_argument(
        "--out", type=Path, help="Explicit transcript.json path (overrides --run-dir)."
    )
    p.add_argument("--video-id", type=int, default=None)
    p.add_argument("--path", type=str, default=None, help="Exact MVS video path.")
    p.add_argument("--query", type=str, default=None, help="Substring of title/path.")
    p.add_argument("--db", type=Path, default=None, help="Override MVS search.db path.")
    args = p.parse_args()

    if not args.out and not args.run_dir:
        print(json.dumps({"error": "pass --run-dir or --out"}))
        return 1
    out_path = args.out or (args.run_dir / "transcript.json")

    conn = connect(args.db or default_db())
    rows = resolve(conn, video_id=args.video_id, path=args.path, query=args.query)
    if not rows:
        print(
            json.dumps(
                {
                    "error": "no MVS video matched",
                    "query": args.query,
                    "path": args.path,
                }
            )
        )
        return 1
    if len(rows) > 1:
        print(
            json.dumps(
                {
                    "ambiguous": True,
                    "count": len(rows),
                    "candidates": [
                        {
                            "id": r["id"],
                            "source": r["source"],
                            "course": r["course"],
                            "title": r["title"],
                            "path": r["path"],
                        }
                        for r in rows
                    ],
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 2

    v = rows[0]
    segments = transcript_segments(conn, int(v["id"]))
    transcript = {
        "status": "ok" if segments else "empty",
        "model": "mvs-index",
        "source": "medicine-video-searcher",
        "segments": segments,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(transcript, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    ocr = ocr_segments(conn, int(v["id"]))
    ocr_path = out_path.parent / "ocr.json"
    ocr_path.write_text(
        json.dumps(
            {
                "status": "ok" if ocr else "empty",
                "model": "mvs-index",
                "source": "medicine-video-searcher",
                "segments": ocr,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "wrote": str(out_path),
                "wroteOcr": str(ocr_path),
                "videoId": int(v["id"]),
                "title": v["title"],
                "source": v["source"],
                "course": v["course"],
                "path": v["path"],
                "segments": len(segments),
                "ocrSegments": len(ocr),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if segments else 1


if __name__ == "__main__":
    raise SystemExit(main())
