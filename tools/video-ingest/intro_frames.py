"""Per-symbol intro-frame extraction.

Pixorize/Sketchy zoom + ring-highlight each symbol as it is introduced. For
reliable identification, cut the frame nearest each symbol's introduction and
let Claude read it to NAME/describe the symbol. Coordinates always come from the
assembled backdrop (intro frames are zoomed -> wrong geometry).

Driven by a draft_symbols.json (the symbol list with order/timestamp_ms and
optional intro_phrases). Reuses extracted run artifacts (video_info.json,
keyframes.json, transcript.json).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2

from ingest_video import (
    VideoInfo,
    find_transcript_time,
    ms_to_stamp,
    read_json,
    save_frame,
    slugify,
    write_json,
)


def resolve_intro_ms(
    transcript: dict[str, Any],
    symbol: dict[str, Any],
    duration_ms: int,
    order: int,
    n_symbols: int,
) -> tuple[int, str]:
    """Introduction timestamp for a symbol. Priority: matched transcript phrase
    -> explicit timestamp_ms -> interpolation by order across the duration."""
    phrases = [str(p) for p in (symbol.get("intro_phrases") or []) if str(p).strip()]
    if phrases:
        matched = find_transcript_time(transcript, phrases, -1)
        if matched >= 0:
            return matched, "phrase"
    ts = symbol.get("timestamp_ms")
    if ts is not None and int(ts or 0) > 0:
        return int(ts), "timestamp"
    interp = (
        int(duration_ms * (order + 1) / (n_symbols + 1))
        if duration_ms and n_symbols
        else 0
    )
    return interp, "order"


def target_frame_number(timestamp_ms: int, fps: float, total_frames: int) -> int:
    frame = int(round((timestamp_ms / 1000) * fps)) if fps else 0
    if total_frames > 0:
        frame = min(frame, total_frames - 1)
    return max(0, frame)


def nearest_keyframe_index(keyframes: list[dict[str, Any]], timestamp_ms: int) -> int:
    return min(
        range(len(keyframes)),
        key=lambda i: abs(int(keyframes[i].get("timestamp_ms", 0)) - timestamp_ms),
    )


def extract_intro_frame(
    cap: cv2.VideoCapture,
    fps: float,
    timestamp_ms: int,
    out_path: Path,
    total_frames: int,
) -> int | None:
    """Save the frame at timestamp_ms, stepping back on VFR/EOF read failures."""
    target = target_frame_number(timestamp_ms, fps, total_frames)
    for back in (0, 1, 3, 7, 15):
        frame_number = max(0, target - back)
        if save_frame(cap, frame_number, out_path):
            return frame_number
    return None


def extract_intro_frames(
    out_dir: Path,
    symbols: list[dict[str, Any]],
    mode: str = "fresh",
    neighbors_s: float = 0.0,
) -> dict[str, Any]:
    info = VideoInfo(**read_json(out_dir / "video_info.json"))
    keyframes = [k for k in read_json(out_dir / "keyframes.json")]
    transcript_path = out_dir / "transcript.json"
    transcript = (
        read_json(transcript_path)
        if transcript_path.exists()
        else {"status": "skipped", "segments": []}
    )
    intro_dir = out_dir / "intro_frames"
    intro_dir.mkdir(parents=True, exist_ok=True)

    video_path = Path(info.path)
    cap = None
    if mode == "fresh" and video_path.exists():
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            cap = None
    effective_mode = "fresh" if cap is not None else "nearest"

    n = len(symbols)
    frames: list[dict[str, Any]] = []
    for symbol in symbols:
        order = int(symbol.get("order", len(frames)))
        key = slugify(
            str(
                symbol.get("symbol_key") or symbol.get("symbol_description") or "symbol"
            )
        )
        ms, resolved_by = resolve_intro_ms(
            transcript, symbol, info.duration_ms, order, n
        )

        record: dict[str, Any] = {
            "order": order,
            "symbol_key": symbol.get("symbol_key"),
            "timestamp_ms": ms,
            "stamp": ms_to_stamp(ms),
            "resolved_by": resolved_by,
            "neighbors": [],
        }

        if effective_mode == "fresh" and cap is not None:
            out_path = intro_dir / f"intro_{order:03d}_{key}_{ms:09d}.jpg"
            saved = extract_intro_frame(cap, info.fps, ms, out_path, info.frames)
            record["image"] = str(out_path) if saved is not None else None
            if neighbors_s > 0 and saved is not None:
                for delta_ms in (-int(neighbors_s * 1000), int(neighbors_s * 1000)):
                    nt = max(0, ms + delta_ms)
                    np_path = intro_dir / f"intro_{order:03d}_{key}_{nt:09d}_n.jpg"
                    if (
                        extract_intro_frame(cap, info.fps, nt, np_path, info.frames)
                        is not None
                    ):
                        record["neighbors"].append(str(np_path))
        else:
            idx = nearest_keyframe_index(keyframes, ms) if keyframes else None
            record["image"] = keyframes[idx]["image"] if idx is not None else None
            record["nearest_keyframe_index"] = idx

        frames.append(record)

    if cap is not None:
        cap.release()

    result = {"video": slugify(info.title), "mode": effective_mode, "frames": frames}
    write_json(out_dir / "intro_frames.json", result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract per-symbol intro frames.")
    parser.add_argument(
        "--out-dir", required=True, type=Path, help="Run dir (<out-root>/<slug>)"
    )
    parser.add_argument("--draft", required=True, type=Path, help="draft_symbols.json")
    parser.add_argument("--mode", choices=["fresh", "nearest"], default="fresh")
    parser.add_argument(
        "--neighbors", type=float, default=0.0, help="+/- seconds around intro"
    )
    args = parser.parse_args()

    draft = read_json(args.draft)
    result = extract_intro_frames(
        args.out_dir,
        draft.get("symbols", []),
        mode=args.mode,
        neighbors_s=args.neighbors,
    )
    print(
        json.dumps({"mode": result["mode"], "frames": len(result["frames"])}, indent=2)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
