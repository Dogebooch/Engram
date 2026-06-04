r"""Resumable ingest queue for building the Engram library from the MVS index.

State is DERIVED, not remembered, so it survives new sessions and context resets:

    pending = (all MVS videos) - (videos with a built .engram.zip) - (skiplist)

"Done" = a `<out-root>/<slug>/<slug>.engram.zip` exists, where `slug = slugify(video
stem)` exactly as `ingest_video.py` computes it. The only persisted state is a tiny
ledger of manual skips/flags/ready-marks in `ingest_queue.json` next to this script.
"Study-ready" is a curated subset: built AND lint-clean AND vetted (the autopilot marks
`ok` results ready; pan/black-backdrop builds are flagged, not ready). A run that
dies mid-batch leaves no zip for the unfinished videos, so they simply re-appear next
time -- crash-safe for free.

Default order is source -> course -> title (course-by-course progression). Filter the
scope with --source / --course.

Commands:
  next   --count N [--source S] [--course C]   next N pending videos as JSON
  status [--source S]                          progress counts (per-source breakdown)
  skip   <id> --reason "..."                   never queue this video again
  unskip <id>
  flag   <id> --note "..."                     mark for later review (still counts done)
  unflag <id>
  ready  <id> --note "..."                     mark study-ready (built + lint-clean + vetted)
  unready <id>
  ready-list [--source S] [--write]            list study-ready (--write renders STUDY_READY.md)
  reset  <id> [--purge]                        delete its zip (and run dir) so it re-queues

Stdlib only. Run with any Python:
  python ingest_queue.py status
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
from pathlib import Path

DEFAULT_OUT_ROOT = Path(r"P:\Python Projects\Engram\video-ingest-runs")
LEDGER_PATH = Path(__file__).resolve().parent / "ingest_queue.json"
STUDY_READY_PATH = Path(__file__).resolve().parents[2] / "STUDY_READY.md"
# Transcripts at/above this many segments are "dense" (Sketchy SOAP-style) -> the
# batch wrapper should process fewer of them per turn.
DENSE_SEGMENTS = 250


def slugify(value: str) -> str:
    """Mirror ingest_video.slugify so 'done' detection matches built bundle paths."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "video"


def mvs_db() -> Path:
    env = os.environ.get("MVS_DB")
    if env:
        return Path(env)
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local) / "MedicineVideoSearcher" / "search.db"


def resolve_out_root(args: argparse.Namespace) -> Path:
    if getattr(args, "out_root", None):
        return Path(args.out_root)
    return Path(os.environ.get("ENGRAM_OUT_ROOT") or DEFAULT_OUT_ROOT)


def connect() -> sqlite3.Connection:
    db = mvs_db()
    if not db.exists():
        raise FileNotFoundError(f"MVS database not found: {db}")
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    return conn


def load_ledger() -> dict:
    if LEDGER_PATH.exists():
        try:
            data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
            data.setdefault("skips", {})
            data.setdefault("flags", {})
            data.setdefault("ready", {})
            return data
        except Exception:
            pass
    return {"skips": {}, "flags": {}, "ready": {}}


def save_ledger(data: dict) -> None:
    LEDGER_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def fetch_videos(
    conn: sqlite3.Connection, source: str | None, course: str | None
) -> list[sqlite3.Row]:
    clauses: list[str] = []
    params: list[object] = []
    if source:
        clauses.append("source = ?")
        params.append(source)
    if course:
        clauses.append("course LIKE ?")
        params.append(f"%{course}%")
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    return conn.execute(
        f"SELECT id, source, course, title, path FROM videos{where} ORDER BY source, course, title",
        params,
    ).fetchall()


def is_done(root: Path, path: str) -> bool:
    slug = slugify(Path(path).stem)
    return (root / slug / f"{slug}.engram.zip").exists()


def seg_count(conn: sqlite3.Connection, video_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM segments WHERE video_id = ? AND kind = 'transcript'",
        (video_id,),
    ).fetchone()
    return int(row["n"] or 0)


def resolve_one(conn: sqlite3.Connection, video_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, source, course, title, path FROM videos WHERE id = ?", (video_id,)
    ).fetchone()


# --------------------------------------------------------------------------- #
def cmd_next(args: argparse.Namespace) -> int:
    conn = connect()
    ledger = load_ledger()
    skips = {int(k) for k in ledger["skips"]}
    root = resolve_out_root(args)
    rows = fetch_videos(conn, args.source, args.course)
    pending = [
        r for r in rows if int(r["id"]) not in skips and not is_done(root, r["path"])
    ]
    batch = pending[: args.count]
    videos = []
    for r in batch:
        segs = seg_count(conn, int(r["id"]))
        videos.append(
            {
                "id": int(r["id"]),
                "source": r["source"],
                "course": r["course"],
                "title": r["title"],
                "path": r["path"],
                "slug": slugify(Path(r["path"]).stem),
                "transcriptSegments": segs,
                "dense": segs >= DENSE_SEGMENTS,
                "flagged": str(int(r["id"])) in ledger["flags"],
            }
        )
    print(
        json.dumps(
            {
                "outRoot": str(root),
                "scope": {"source": args.source, "course": args.course},
                "requested": args.count,
                "returned": len(videos),
                "pendingTotal": len(pending),
                "videos": videos,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    conn = connect()
    ledger = load_ledger()
    skips = {int(k) for k in ledger["skips"]}
    flags = {int(k) for k in ledger["flags"]}
    ready = {int(k) for k in ledger["ready"]}
    root = resolve_out_root(args)
    rows = fetch_videos(conn, args.source, None)
    per_source: dict[str, dict[str, int]] = {}
    done = pending = skipped = flagged = ready_count = 0
    for r in rows:
        src = str(r["source"])
        bucket = per_source.setdefault(
            src, {"total": 0, "done": 0, "pending": 0, "skipped": 0, "ready": 0}
        )
        bucket["total"] += 1
        vid = int(r["id"])
        if vid in flags:
            flagged += 1
        if vid in ready:
            ready_count += 1
            bucket["ready"] += 1
        if vid in skips:
            skipped += 1
            bucket["skipped"] += 1
        elif is_done(root, r["path"]):
            done += 1
            bucket["done"] += 1
        else:
            pending += 1
            bucket["pending"] += 1
    total = len(rows)
    print(
        json.dumps(
            {
                "outRoot": str(root),
                "scope": {"source": args.source},
                "total": total,
                "done": done,
                "pending": pending,
                "skipped": skipped,
                "flagged": flagged,
                "ready": ready_count,
                "percentDone": round(100 * done / total, 1) if total else 0.0,
                "bySource": per_source,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def _set_ledger_entry(args: argparse.Namespace, bucket: str, value: str | None) -> int:
    conn = connect()
    row = resolve_one(conn, args.id)
    if row is None:
        print(json.dumps({"error": f"no MVS video with id {args.id}"}))
        return 1
    ledger = load_ledger()
    key = str(args.id)
    if value is None:
        ledger[bucket].pop(key, None)
        action = f"removed from {bucket}"
    else:
        ledger[bucket][key] = value
        action = f"added to {bucket}"
    save_ledger(ledger)
    print(
        json.dumps(
            {"id": args.id, "title": row["title"], "action": action, "value": value},
            ensure_ascii=False,
        )
    )
    return 0


def cmd_skip(args: argparse.Namespace) -> int:
    return _set_ledger_entry(args, "skips", args.reason or "skipped")


def cmd_unskip(args: argparse.Namespace) -> int:
    return _set_ledger_entry(args, "skips", None)


def cmd_flag(args: argparse.Namespace) -> int:
    return _set_ledger_entry(args, "flags", args.note or "flagged for review")


def cmd_unflag(args: argparse.Namespace) -> int:
    return _set_ledger_entry(args, "flags", None)


def cmd_ready(args: argparse.Namespace) -> int:
    return _set_ledger_entry(args, "ready", args.note or "study-ready")


def cmd_unready(args: argparse.Namespace) -> int:
    return _set_ledger_entry(args, "ready", None)


def render_ready_md(items: list[dict], total: int) -> str:
    lines = [
        f"# Study-ready videos ({len(items)} / {total})",
        "",
        "_Built, lint-clean, and vetted — do not re-ingest. Regenerate with `ingest_queue.py ready-list --write`._",
        "",
    ]
    by_src: dict[str, dict[str, list[dict]]] = {}
    for it in items:
        by_src.setdefault(str(it["source"]), {}).setdefault(
            str(it["course"] or ""), []
        ).append(it)
    for src in sorted(by_src):
        lines.append(f"## {src}")
        for course in sorted(by_src[src]):
            if course:
                lines.append(f"### {course}")
            for it in sorted(by_src[src][course], key=lambda x: str(x["title"])):
                note = it["note"]
                suffix = f" — {note}" if note and note != "study-ready" else ""
                lines.append(f"- [x] {it['title']}{suffix}")
        lines.append("")
    return "\n".join(lines)


def cmd_ready_list(args: argparse.Namespace) -> int:
    conn = connect()
    ledger = load_ledger()
    ready = ledger["ready"]
    rows = fetch_videos(conn, args.source, None)
    items = [
        {
            "id": int(r["id"]),
            "source": r["source"],
            "course": r["course"],
            "title": r["title"],
            "note": ready[str(int(r["id"]))],
        }
        for r in rows
        if str(int(r["id"])) in ready
    ]
    if args.write:
        STUDY_READY_PATH.write_text(render_ready_md(items, len(rows)), encoding="utf-8")
        print(
            json.dumps(
                {"wrote": str(STUDY_READY_PATH), "ready": len(items)},
                ensure_ascii=False,
            )
        )
    else:
        print(
            json.dumps(
                {"ready": len(items), "videos": items}, indent=2, ensure_ascii=False
            )
        )
    return 0


def cmd_reset(args: argparse.Namespace) -> int:
    conn = connect()
    row = resolve_one(conn, args.id)
    if row is None:
        print(json.dumps({"error": f"no MVS video with id {args.id}"}))
        return 1
    root = resolve_out_root(args)
    slug = slugify(Path(row["path"]).stem)
    run_dir = root / slug
    zip_path = run_dir / f"{slug}.engram.zip"
    removed = []
    if args.purge and run_dir.exists():
        shutil.rmtree(run_dir)
        removed.append(str(run_dir))
    elif zip_path.exists():
        zip_path.unlink()
        removed.append(str(zip_path))
    print(
        json.dumps(
            {
                "id": args.id,
                "title": row["title"],
                "slug": slug,
                "removed": removed,
                "requeued": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Resumable Engram ingest queue (derived from MVS index + built zips)."
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_next = sub.add_parser("next", help="Print the next N pending videos as JSON.")
    p_next.add_argument("--count", type=int, default=5)
    p_next.add_argument("--source", type=str, default=None)
    p_next.add_argument("--course", type=str, default=None)
    p_next.add_argument("--out-root", type=str, default=None)
    p_next.set_defaults(func=cmd_next)

    p_status = sub.add_parser(
        "status", help="Progress counts with a per-source breakdown."
    )
    p_status.add_argument("--source", type=str, default=None)
    p_status.add_argument("--out-root", type=str, default=None)
    p_status.set_defaults(func=cmd_status)

    p_skip = sub.add_parser("skip", help="Never queue this video again.")
    p_skip.add_argument("id", type=int)
    p_skip.add_argument("--reason", type=str, default=None)
    p_skip.set_defaults(func=cmd_skip)

    p_unskip = sub.add_parser("unskip", help="Remove a video from the skiplist.")
    p_unskip.add_argument("id", type=int)
    p_unskip.set_defaults(func=cmd_unskip)

    p_flag = sub.add_parser(
        "flag", help="Mark a video for later review (still counts as done)."
    )
    p_flag.add_argument("id", type=int)
    p_flag.add_argument("--note", type=str, default=None)
    p_flag.set_defaults(func=cmd_flag)

    p_unflag = sub.add_parser("unflag", help="Remove a review flag.")
    p_unflag.add_argument("id", type=int)
    p_unflag.set_defaults(func=cmd_unflag)

    p_ready = sub.add_parser("ready", help="Mark a video study-ready (built + vetted).")
    p_ready.add_argument("id", type=int)
    p_ready.add_argument("--note", type=str, default=None)
    p_ready.set_defaults(func=cmd_ready)

    p_unready = sub.add_parser("unready", help="Remove a study-ready mark.")
    p_unready.add_argument("id", type=int)
    p_unready.set_defaults(func=cmd_unready)

    p_ready_list = sub.add_parser(
        "ready-list", help="List study-ready videos (--write renders STUDY_READY.md)."
    )
    p_ready_list.add_argument("--source", type=str, default=None)
    p_ready_list.add_argument(
        "--write", action="store_true", help="Render the checklist to STUDY_READY.md."
    )
    p_ready_list.set_defaults(func=cmd_ready_list)

    p_reset = sub.add_parser(
        "reset", help="Delete a video's built zip so it re-queues."
    )
    p_reset.add_argument("id", type=int)
    p_reset.add_argument(
        "--purge",
        action="store_true",
        help="Remove the whole run dir, not just the zip.",
    )
    p_reset.add_argument("--out-root", type=str, default=None)
    p_reset.set_defaults(func=cmd_reset)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
