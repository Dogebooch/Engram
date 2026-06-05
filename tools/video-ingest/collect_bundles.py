r"""Collect built .engram.zip bundles out of the scattered run dirs into one
import-ready folder, named for humans and split by vetted status.

Each completed run dir under the out-root already holds a finished
`<slug>/<slug>.engram.zip`. Engram's importer reads the display name from the
`meta.json` *inside* the zip, so the only thing missing for a clean bulk import
is collecting the zips into one place under readable filenames.

This copies (never moves) every built bundle into:

    <out-root>/_engram-import/
        study-ready/        bundles whose MVS video id is marked ready in the ledger
        built-unvetted/     built but not yet vetted study-ready
        GAPS.md             run dirs authored-but-unpackaged / extraction-only

Filenames are "Source - Course - Name.engram.zip", sanitized for Windows, with a
" (2)" suffix on collision.

Stdlib only. Run with any Python:
    python collect_bundles.py --dry-run
    python collect_bundles.py
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

import ingest_queue

DEST_NAME = "_engram-import"
MAX_BASE_LEN = 150

_ILLEGAL = re.compile(r'[\\:*?"<>|]')


def sanitize_component(value: str) -> str:
    """Make one path component safe and readable for a Windows filename."""
    value = value.replace("/", " - ")  # course path separator -> readable
    value = _ILLEGAL.sub("-", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value.strip(" .-")


def build_basename(source: str, course: str, name: str) -> str:
    """'Source - Course - Name', dropping empty parts, capped in length."""
    parts = [sanitize_component(p) for p in (source, course, name) if p]
    parts = [p for p in parts if p]
    deduped: list[str] = []
    for p in parts:
        if not deduped or deduped[-1].lower() != p.lower():
            deduped.append(p)
    base = " - ".join(deduped) or "bundle"
    if len(base) > MAX_BASE_LEN:
        base = base[:MAX_BASE_LEN].strip(" .-")
    return base


def dedupe_name(base: str, used: set[str]) -> str:
    """Return '<base>.engram.zip', suffixing ' (n)' until unique within `used`."""
    candidate = f"{base}.engram.zip"
    n = 2
    while candidate.lower() in used:
        candidate = f"{base} ({n}).engram.zip"
        n += 1
    used.add(candidate.lower())
    return candidate


def classify(video_id, ready_keys: set[str]) -> str:
    """'study-ready' if the bundle's MVS id is marked ready, else 'built-unvetted'."""
    if video_id is not None and str(video_id) in ready_keys:
        return "study-ready"
    return "built-unvetted"


def read_bundle_meta(zip_path: Path) -> dict | None:
    """Read meta.json from inside the bundle zip; None if absent/unreadable."""
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = [n for n in zf.namelist() if n.endswith("meta.json")]
            if not names:
                return None
            return json.loads(zf.read(names[0]))
    except (zipfile.BadZipFile, json.JSONDecodeError, KeyError, OSError):
        return None


def collect(out_root: Path, dest: Path, ready_keys: set[str], dry_run: bool) -> dict:
    ready_dir = dest / "study-ready"
    unvetted_dir = dest / "built-unvetted"
    if not dry_run:
        ready_dir.mkdir(parents=True, exist_ok=True)
        unvetted_dir.mkdir(parents=True, exist_ok=True)

    used: dict[str, set[str]] = {"study-ready": set(), "built-unvetted": set()}
    copied = {"study-ready": 0, "built-unvetted": 0}
    collisions = 0
    no_source_id: list[str] = []
    bad_zip: list[str] = []
    authored_not_packaged: list[str] = []
    extraction_only: list[str] = []

    for run_dir in sorted(p for p in out_root.iterdir() if p.is_dir()):
        if run_dir.name.startswith("_"):
            continue
        zips = sorted(run_dir.glob("*.engram.zip"))
        if not zips:
            if (run_dir / "draft_symbols.json").exists():
                authored_not_packaged.append(run_dir.name)
            else:
                extraction_only.append(run_dir.name)
            continue

        zip_path = zips[0]
        meta = read_bundle_meta(zip_path)
        if meta is None:
            bad_zip.append(run_dir.name)
            continue

        source_video = meta.get("sourceVideo") or {}
        video_id = source_video.get("id")
        source = str(source_video.get("source") or "")
        course = str(source_video.get("course") or "")
        name = str(meta.get("name") or run_dir.name)
        if video_id is None:
            no_source_id.append(run_dir.name)

        bucket = classify(video_id, ready_keys)
        base = build_basename(source, course, name)
        filename = dedupe_name(base, used[bucket])
        if filename != f"{base}.engram.zip":
            collisions += 1

        target_dir = ready_dir if bucket == "study-ready" else unvetted_dir
        if not dry_run:
            shutil.copy2(zip_path, target_dir / filename)
        copied[bucket] += 1

    summary = {
        "outRoot": str(out_root),
        "dest": str(dest),
        "dryRun": dry_run,
        "copied": copied,
        "total": copied["study-ready"] + copied["built-unvetted"],
        "collisions": collisions,
        "gaps": {
            "authoredNotPackaged": len(authored_not_packaged),
            "extractionOnly": len(extraction_only),
            "badZip": len(bad_zip),
            "noSourceVideoId": len(no_source_id),
        },
    }
    if not dry_run:
        write_gaps_md(
            dest, summary, authored_not_packaged, extraction_only, bad_zip, no_source_id
        )
    return summary


def write_gaps_md(
    dest: Path,
    summary: dict,
    authored_not_packaged: list[str],
    extraction_only: list[str],
    bad_zip: list[str],
    no_source_id: list[str],
) -> None:
    lines = [
        "# Ingest collection gaps",
        "",
        f"Copied **{summary['copied']['study-ready']}** study-ready + "
        f"**{summary['copied']['built-unvetted']}** built-unvetted "
        f"= **{summary['total']}** bundles into `{DEST_NAME}/`.",
        "",
        f"## Authored but never packaged ({len(authored_not_packaged)})",
        "_Have `draft_symbols.json` but no `.engram.zip` — re-run the ingest "
        "build to package them._",
        "",
    ]
    lines += [f"- {n}" for n in authored_not_packaged] or ["_(none)_"]
    lines += [
        "",
        f"## Built zips with unreadable/missing meta.json ({len(bad_zip)})",
        "",
    ]
    lines += [f"- {n}" for n in bad_zip] or ["_(none)_"]
    lines += [
        "",
        f"## Built zips missing sourceVideo.id ({len(no_source_id)})",
        "_Collected into built-unvetted (could not confirm ready status)._",
        "",
    ]
    lines += [f"- {n}" for n in no_source_id] or ["_(none)_"]
    lines += [
        "",
        f"## Extraction-only, nothing to import ({len(extraction_only)})",
        "_No `.engram.zip` and no `draft_symbols.json` — never authored._",
        "",
    ]
    lines += [f"- {n}" for n in extraction_only] or ["_(none)_"]
    (dest / "GAPS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-root",
        default=None,
        help="Run-dir root (default: ENGRAM_OUT_ROOT or the built-in default).",
    )
    parser.add_argument(
        "--dest",
        default=None,
        help=f"Output dir (default: <out-root>/{DEST_NAME}).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and report counts without copying anything.",
    )
    args = parser.parse_args()

    out_root = ingest_queue.resolve_out_root(args)
    dest = Path(args.dest) if args.dest else out_root / DEST_NAME
    ready_keys = set(ingest_queue.load_ledger()["ready"].keys())

    summary = collect(out_root, dest, ready_keys, args.dry_run)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
