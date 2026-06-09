#!/usr/bin/env python3
"""Build a video-less, image-less .engram.zip from a mnemonic design JSON.

This is the optional handoff for the `design-mnemonic` skill: it turns an
authored scene design (Sections / Facts / symbol bullets, no artwork) into a
bundle the Engram dev app can import via the normal drag-drop path. Every symbol
lands as an *un-traced placeholder rect* the user outlines by hand in the editor.

Self-contained on purpose (stdlib only) so it runs with plain `python` and does
not pull in the video-ingest venv (cv2 / Whisper). The bundle shape mirrors
`tools/video-ingest/ingest_video.py:make_bundle` minus the backdrop coupling, and
matches the import contract in `src/lib/export/import.ts` (needs only
notes.md + canvas.json + meta.json; assets/manifest optional; a both-null
backdrop is a valid no-backdrop scene).

Schema versions below are kept in lockstep BY HAND with the canonical source
`tools/video-ingest/ingest_video.py` (CANVAS_SCHEMA_VERSION, BUNDLE_SCHEMA_VERSION)
and `src/lib/constants` (SUPPORTED_BUNDLE_SCHEMA_VERSIONS = [1, 2]). If those bump,
bump here.

Design JSON shape
-----------------
{
  "name": "Scene title",            # required -> meta.name
  "tags": ["pharm"],                # optional
  "sections": [                     # optional; omit for a flat scene
    { "name": "Mechanism", "facts": [
        { "fact": "terse clinical fact",
          "symbols": [
            { "key": "albuterol-troll",          # stable handle; reuse across
              "description": "Albu-TROLL ...",   #   facts -> shared placeholder
              "meaning": "albuterol",            # optional
              "encoding": "Albu-TROLL ~ albuterol (why)" }  # optional
          ] } ] }
  ],
  "facts": [ ... ]                  # flat alternative when there are no sections
}

Usage
-----
  python make_engram_package.py --design design.json [--out-dir DIR]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any

# Keep in lockstep with tools/video-ingest/ingest_video.py + src/lib/constants.
CANVAS_SCHEMA_VERSION = 1
BUNDLE_SCHEMA_VERSION = 2


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "scene"


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _iter_sections(design: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize to a list of {name|None, facts:[...]} blocks, order preserved."""
    sections = design.get("sections")
    if isinstance(sections, list) and sections:
        return [
            {"name": clean_text(s.get("name")) or None, "facts": s.get("facts") or []}
            for s in sections
        ]
    return [{"name": None, "facts": design.get("facts") or []}]


def build_bundle(design: dict[str, Any], out_dir: Path) -> Path:
    name = clean_text(design.get("name"))
    if not name:
        raise ValueError("design.name is required")
    slug = slugify(name)
    now_ms = int(time.time() * 1000)

    blocks = _iter_sections(design)

    # One placeholder layer per DISTINCT symbol key, in first-seen order, so a
    # symbol reused across facts shares a single canvas placeholder.
    layer_id_by_key: dict[str, str] = {}
    canvas_symbols: list[dict[str, Any]] = []

    def ensure_layer(key: str) -> str:
        if key in layer_id_by_key:
            return layer_id_by_key[key]
        layer_id = str(uuid.uuid4())
        layer_id_by_key[key] = layer_id
        i = len(canvas_symbols)
        col, row = i % 5, i // 5
        canvas_symbols.append(
            {
                "id": layer_id,
                "kind": "region",
                "ref": None,
                "shape": "rect",
                "x": 80 + col * 360,
                "y": 80 + row * 240,
                "width": 300,
                "height": 200,
                "rotation": 0,
                "layerIndex": i,
                "groupId": None,
                "animation": None,
                "animationDelay": None,
                "animationDuration": None,
            }
        )
        return layer_id

    notes_lines: list[str] = []
    flat = len(blocks) == 1 and blocks[0]["name"] is None

    for block in blocks:
        heading = block["name"] or name
        notes_lines.append(f"# {heading}")
        notes_lines.append("")
        for fact in block["facts"]:
            fact_text = clean_text(fact.get("fact"))
            if not fact_text:
                raise ValueError("every fact needs a non-empty 'fact'")
            notes_lines.append(f"## {fact_text}")
            for sym in fact.get("symbols") or []:
                key = clean_text(sym.get("key")) or slugify(
                    clean_text(sym.get("description"))
                )
                description = clean_text(sym.get("description"))
                if not description:
                    raise ValueError(
                        f"symbol under '{fact_text}' has an empty description "
                        "(the mandatory lint floor)"
                    )
                layer_id = ensure_layer(key)
                line = f"* {{sym:{layer_id}}} {description}"
                meaning = clean_text(sym.get("meaning"))
                if meaning:
                    line += f" -> {meaning}"
                    encoding = clean_text(sym.get("encoding"))
                    if encoding:
                        line += f"; {encoding}"
                notes_lines.append(line)
            notes_lines.append("")

    # `flat` only affects whether we emitted the scene name as the lone section
    # heading (we always do, via `heading = block["name"] or name`); kept explicit
    # for readability of the two layouts.
    del flat

    canvas = {
        "schemaVersion": CANVAS_SCHEMA_VERSION,
        "backdrop": {"ref": None, "uploadedBlobId": None, "opacity": 1},
        "symbols": canvas_symbols,
        "groups": [],
        "factHotspots": {},
        "factMeta": {},
        "timeline": [],
    }
    tags = design.get("tags")
    meta = {
        "schemaVersion": BUNDLE_SCHEMA_VERSION,
        "id": str(uuid.uuid4()),
        "name": name,
        "tags": [clean_text(t) for t in tags] if isinstance(tags, list) else [],
        "sourceVideo": None,
        "createdAt": now_ms,
        "updatedAt": now_ms,
        "exportedAt": now_ms,
    }
    manifest = {"version": 2, "assets": [], "backdrops": []}

    out_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = out_dir / f"{slug}.engram.zip"
    with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        folder = slug
        zf.writestr(f"{folder}/notes.md", "\n".join(notes_lines).rstrip() + "\n")
        zf.writestr(f"{folder}/canvas.json", json.dumps(canvas, indent=2))
        zf.writestr(f"{folder}/meta.json", json.dumps(meta, indent=2))
        zf.writestr(f"{folder}/assets/manifest.json", json.dumps(manifest, indent=2))
    return bundle_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--design", required=True, help="Path to the design JSON.")
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Output directory (default: the design file's directory).",
    )
    args = parser.parse_args()

    design_path = Path(args.design)
    design = json.loads(design_path.read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir) if args.out_dir else design_path.parent
    bundle_path = build_bundle(design, out_dir)
    print(bundle_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
