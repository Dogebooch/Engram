from __future__ import annotations

import argparse
import contextlib
import json
import re
import shutil
import time
import uuid
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2

from captions import get_transcript


STAGE_WIDTH = 1920
STAGE_HEIGHT = 1080
CANVAS_SCHEMA_VERSION = 1
BUNDLE_SCHEMA_VERSION = 2


class StageTimer:
    """Accumulate wall-clock seconds per pipeline stage for timing.json."""

    def __init__(self) -> None:
        self.stages: dict[str, float] = {}

    def record(self, name: str, seconds: float) -> None:
        self.stages[name] = round(self.stages.get(name, 0.0) + seconds, 2)

    @contextlib.contextmanager
    def time(self, name: str):
        start = time.time()
        try:
            yield
        finally:
            self.record(name, time.time() - start)

    def total(self) -> float:
        return round(sum(self.stages.values()), 2)


@dataclass
class VideoInfo:
    path: str
    title: str
    fps: float
    frames: int
    duration_ms: int
    width: int
    height: int


@dataclass
class Keyframe:
    index: int
    timestamp_ms: int
    frame_number: int
    image: str
    diff_score: float
    context_before: list[str]
    context_after: list[str]
    selected_as_backdrop: bool = False


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "video"


def ms_to_stamp(ms: int) -> str:
    total = ms // 1000
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def read_video_info(video: Path) -> VideoInfo:
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()
    duration_ms = int((frames / fps) * 1000) if fps > 0 and frames > 0 else 0
    return VideoInfo(
        path=str(video),
        title=video.stem,
        fps=fps,
        frames=frames,
        duration_ms=duration_ms,
        width=width,
        height=height,
    )


def ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_frame(cap: cv2.VideoCapture, frame_number: int, out_path: Path) -> bool:
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(frame_number, 0))
    ok, frame = cap.read()
    if not ok:
        return False
    return bool(cv2.imwrite(str(out_path), frame))


def frame_hist(frame: Any) -> Any:
    resized = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
    cv2.normalize(hist, hist)
    return hist


def extract_keyframes(
    video: Path,
    out_dir: Path,
    sample_seconds: float,
    min_gap_seconds: float,
    max_keyframes: int,
    context_seconds: float,
    diff_threshold: float,
) -> list[Keyframe]:
    frames_dir = out_dir / "frames"
    ensure_clean_dir(frames_dir)
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    sample_step = max(1, int(round(fps * sample_seconds)))
    min_gap_frames = max(1, int(round(fps * min_gap_seconds)))
    context_frames = max(1, int(round(fps * context_seconds)))

    candidates: list[tuple[int, float]] = []
    previous_hist = None
    for frame_number in range(0, total_frames, sample_step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ok, frame = cap.read()
        if not ok:
            continue
        hist = frame_hist(frame)
        if previous_hist is None:
            diff = 1.0
        else:
            correlation = cv2.compareHist(previous_hist, hist, cv2.HISTCMP_CORREL)
            diff = float(max(0.0, 1.0 - correlation))
        previous_hist = hist
        if diff >= diff_threshold or not candidates:
            if not candidates or frame_number - candidates[-1][0] >= min_gap_frames:
                candidates.append((frame_number, diff))

    if len(candidates) > max_keyframes:
        first = candidates[0]
        rest = sorted(candidates[1:], key=lambda x: x[1], reverse=True)
        selected = [first, *rest[: max_keyframes - 1]]
        candidates = sorted(selected, key=lambda x: x[0])

    keyframes: list[Keyframe] = []
    for index, (frame_number, diff) in enumerate(candidates):
        ts_ms = int((frame_number / fps) * 1000)
        image_name = f"keyframe_{index:03d}_{ts_ms:09d}.jpg"
        image_path = frames_dir / image_name
        if not save_frame(cap, frame_number, image_path):
            continue
        before_name = f"keyframe_{index:03d}_{ts_ms:09d}_before.jpg"
        after_name = f"keyframe_{index:03d}_{ts_ms:09d}_after.jpg"
        before_path = frames_dir / before_name
        after_path = frames_dir / after_name
        before: list[str] = []
        after: list[str] = []
        if save_frame(cap, max(0, frame_number - context_frames), before_path):
            before.append(str(before_path))
        if save_frame(
            cap, min(total_frames - 1, frame_number + context_frames), after_path
        ):
            after.append(str(after_path))
        keyframes.append(
            Keyframe(
                index=index,
                timestamp_ms=ts_ms,
                frame_number=frame_number,
                image=str(image_path),
                diff_score=round(diff, 4),
                context_before=before,
                context_after=after,
            )
        )

    cap.release()
    if keyframes:
        keyframes[-1].selected_as_backdrop = True
    return keyframes


def transcribe(video: Path, out_dir: Path, model_name: str) -> dict[str, Any]:
    started = time.time()
    try:
        # faster-whisper (ctranslate2) links its own OpenMP runtime; without
        # this it aborts with "OMP Error #15" when torch's OpenMP is already
        # loaded, crashing the Whisper fallback on caption-less videos.
        import os

        os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
        from faster_whisper import WhisperModel
    except ImportError as exc:
        return {
            "status": "skipped",
            "reason": f"faster-whisper not installed: {exc}",
            "segments": [],
        }

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments_iter, info = model.transcribe(
        str(video),
        vad_filter=True,
        word_timestamps=False,
    )
    segments = []
    srt_lines = []
    for i, segment in enumerate(segments_iter, start=1):
        start_ms = int(segment.start * 1000)
        end_ms = int(segment.end * 1000)
        text = segment.text.strip()
        segments.append(
            {
                "start_ms": start_ms,
                "end_ms": end_ms,
                "text": text,
            }
        )
        srt_lines.extend(
            [
                str(i),
                f"{srt_time(start_ms)} --> {srt_time(end_ms)}",
                text,
                "",
            ]
        )
    (out_dir / "transcript.srt").write_text("\n".join(srt_lines), encoding="utf-8")
    return {
        "status": "ok",
        "model": model_name,
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "elapsed_seconds": round(time.time() - started, 2),
        "segments": segments,
    }


def srt_time(ms: int) -> str:
    total_ms = ms
    h, rem = divmod(total_ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, milli = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"


def find_transcript_time(
    transcript: dict[str, Any],
    phrases: list[str],
    fallback_ms: int,
) -> int:
    wanted = [p.lower() for p in phrases if p.strip()]
    for phrase in wanted:
        for segment in transcript.get("segments", []):
            text = clean_text(segment.get("text")).lower()
            if phrase in text:
                return int(segment.get("start_ms") or fallback_ms)
    return fallback_ms


def has_valid_box(box: dict[str, Any]) -> bool:
    try:
        return (
            float(box.get("width", 0) or 0) > 1 and float(box.get("height", 0) or 0) > 1
        )
    except (TypeError, ValueError):
        return False


def is_whole_frame_box(box: dict[str, Any], src_w: int, src_h: int) -> bool:
    if src_w <= 0 or src_h <= 0 or not has_valid_box(box):
        return False
    clamped = clamp_box(box, src_w, src_h)
    width_ratio = clamped["width"] / src_w
    height_ratio = clamped["height"] / src_h
    area_ratio = (clamped["width"] * clamped["height"]) / (src_w * src_h)
    return area_ratio >= 0.62 or (width_ratio >= 0.88 and height_ratio >= 0.88)


def is_placeable_symbol(symbol: dict[str, Any], src_w: int, src_h: int) -> bool:
    box = symbol.get("bbox") or {}
    return has_valid_box(box) and not is_whole_frame_box(box, src_w, src_h)


def clamp_box(box: dict[str, Any], src_w: int, src_h: int) -> dict[str, float]:
    x = float(box.get("x", 0) or 0)
    y = float(box.get("y", 0) or 0)
    w = float(box.get("width", 0) or 0)
    h = float(box.get("height", 0) or 0)
    x = max(0, min(src_w, x))
    y = max(0, min(src_h, y))
    w = max(1, min(src_w - x, w))
    h = max(1, min(src_h - y, h))
    return {"x": x, "y": y, "width": w, "height": h}


def scaled_polygon(
    points: Any,
    scale_x: float,
    scale_y: float,
) -> dict[str, Any] | None:
    """Convert frame-pixel polygon points into a stage-space region layer
    patch. Accepts a list of [x, y] pairs or {x, y} objects (>= 3 points).
    Returns shape/x/y/width/height/points with points relative to x/y, or
    None when there is no usable polygon."""
    if not isinstance(points, list) or len(points) < 3:
        return None
    scaled: list[tuple[float, float]] = []
    for point in points:
        if isinstance(point, dict):
            px, py = point.get("x"), point.get("y")
        elif isinstance(point, (list, tuple)) and len(point) >= 2:
            px, py = point[0], point[1]
        else:
            return None
        try:
            scaled.append((float(px) * scale_x, float(py) * scale_y))
        except (TypeError, ValueError):
            return None
    min_x = min(p[0] for p in scaled)
    min_y = min(p[1] for p in scaled)
    max_x = max(p[0] for p in scaled)
    max_y = max(p[1] for p in scaled)
    return {
        "shape": "polygon",
        "x": round(min_x, 2),
        "y": round(min_y, 2),
        "width": round(max_x - min_x, 2),
        "height": round(max_y - min_y, 2),
        "points": [
            {"x": round(px - min_x, 2), "y": round(py - min_y, 2)} for px, py in scaled
        ],
    }


def synthesize_fact_id(section: str | None, fact: str, occurrence: int) -> str:
    sec = slugify(section) if section else "_"
    fact_slug = slugify(fact)
    return f"{sec}::{fact_slug}#{occurrence}"


def build_bundle_tags(info: VideoInfo) -> list[str]:
    tags = ["ai-video"]
    title = info.title.lower()
    if "pixorize" in info.path.lower():
        tags.append("pixorize")
    if "biochemistry" in title or "biochemistry" in info.path.lower():
        tags.append("biochemistry")
    if "thiamine" in title or "vitamin b1" in title:
        tags.extend(["thiamine", "vitamin-b1"])
    return list(dict.fromkeys(tags))


def symbol_sort_key(symbol: dict[str, Any]) -> tuple[int, int]:
    try:
        order = int(symbol.get("order"))
    except (TypeError, ValueError):
        order = 9999
    try:
        timestamp = int(symbol.get("timestamp_ms") or 0)
    except (TypeError, ValueError):
        timestamp = 0
    return (order, timestamp)


def make_bundle(
    out_dir: Path,
    info: VideoInfo,
    keyframes: list[Keyframe],
    draft: dict[str, Any],
) -> Path | None:
    if not keyframes:
        return None
    backdrop = next((kf for kf in keyframes if kf.selected_as_backdrop), keyframes[-1])
    backdrop_path = Path(backdrop.image)
    slug = slugify(info.title)
    bundle_path = out_dir / f"{slug}.engram.zip"
    backdrop_id = str(uuid.uuid4())
    picmonic_id = str(uuid.uuid4())
    now_ms = int(time.time() * 1000)

    raw_symbols = sorted(
        draft.get("symbols", []),
        key=symbol_sort_key,
    )
    placed_symbols: list[dict[str, Any]] = []
    rejected_symbols: list[dict[str, Any]] = []
    seen_bullets: set[tuple[str, str]] = set()
    for symbol in raw_symbols:
        localized_to_backdrop = bool(symbol.get("localized_to_backdrop"))
        source_keyframe = int(symbol.get("source_keyframe_index", -1))
        box_width = int(symbol.get("vlm_width") or info.width)
        box_height = int(symbol.get("vlm_height") or info.height)
        bullet_key = (
            slugify(clean_text(symbol.get("fact"))),
            clean_text(symbol.get("symbol_key"))
            or slugify(clean_text(symbol.get("symbol_description"))),
        )
        if bullet_key in seen_bullets:
            continue
        if not localized_to_backdrop and source_keyframe != backdrop.index:
            rejected = {
                **symbol,
                "rejection_reason": "not localized to the representative frame",
            }
            rejected_symbols.append(rejected)
            continue
        if not is_placeable_symbol(symbol, box_width, box_height):
            rejected = {
                **symbol,
                "rejection_reason": "missing or whole-frame bounding box",
            }
            rejected_symbols.append(rejected)
            continue
        seen_bullets.add(bullet_key)
        placed_symbols.append(symbol)

    draft["rejected_symbols"] = rejected_symbols

    notes_lines = [f"# {info.title}", ""]
    canvas_symbols = []
    layer_id_by_key: dict[str, str] = {}
    fact_order: list[str] = []
    fact_symbols: dict[str, list[dict[str, Any]]] = {}

    for symbol in placed_symbols:
        fact = clean_text(symbol.get("fact")) or "Unreviewed finding"
        if fact not in fact_symbols:
            fact_order.append(fact)
            fact_symbols[fact] = []
        fact_symbols[fact].append(symbol)

        symbol_key = clean_text(symbol.get("symbol_key")) or slugify(
            clean_text(symbol.get("symbol_description")) or "visible-region"
        )
        if symbol_key in layer_id_by_key:
            continue
        layer_id = str(uuid.uuid4())
        layer_id_by_key[symbol_key] = layer_id
        box_width = int(symbol.get("vlm_width") or info.width)
        box_height = int(symbol.get("vlm_height") or info.height)
        box = clamp_box(symbol.get("bbox") or {}, box_width, box_height)
        scale_x = STAGE_WIDTH / max(1, box_width)
        scale_y = STAGE_HEIGHT / max(1, box_height)
        layer = {
            "id": layer_id,
            "kind": "region",
            "ref": None,
            "shape": "rect",
            "x": round(box["x"] * scale_x, 2),
            "y": round(box["y"] * scale_y, 2),
            "width": round(box["width"] * scale_x, 2),
            "height": round(box["height"] * scale_y, 2),
            "rotation": 0,
            "layerIndex": len(canvas_symbols),
            "groupId": None,
            "animation": None,
            "animationDelay": None,
            "animationDuration": None,
        }
        polygon = scaled_polygon(symbol.get("polygon"), scale_x, scale_y)
        if polygon:
            layer.update(polygon)
        canvas_symbols.append(layer)

    for fact in fact_order:
        notes_lines.append(f"## {fact}")
        for symbol in fact_symbols[fact]:
            symbol_key = clean_text(symbol.get("symbol_key")) or slugify(
                clean_text(symbol.get("symbol_description")) or "visible-region"
            )
            layer_id = layer_id_by_key[symbol_key]
            description = (
                clean_text(symbol.get("symbol_description")) or "visible region"
            )
            meaning = clean_text(symbol.get("meaning")) or fact
            evidence = (
                clean_text(symbol.get("evidence"))
                or "Detected from the video transcript and representative frame."
            )
            timestamp = int(symbol.get("timestamp_ms") or backdrop.timestamp_ms)
            notes_lines.append(
                f"* {{sym:{layer_id}}} {description} -> {meaning}; {evidence} @ {ms_to_stamp(timestamp)}"
            )
        notes_lines.append("")

    canvas = {
        "schemaVersion": CANVAS_SCHEMA_VERSION,
        "backdrop": {"ref": None, "uploadedBlobId": backdrop_id, "opacity": 1},
        "symbols": canvas_symbols,
        "groups": [],
        "factHotspots": {},
        "factMeta": {},
        "timeline": [],
    }
    meta = {
        "schemaVersion": BUNDLE_SCHEMA_VERSION,
        "id": picmonic_id,
        "name": info.title,
        "tags": build_bundle_tags(info),
        "createdAt": now_ms,
        "updatedAt": now_ms,
        "exportedAt": now_ms,
    }
    manifest = {
        "version": 2,
        "assets": [],
        "backdrops": [{"id": backdrop_id, "ext": "jpg", "mimeType": "image/jpeg"}],
    }
    with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        folder = slug
        zf.writestr(f"{folder}/notes.md", "\n".join(notes_lines))
        zf.writestr(f"{folder}/canvas.json", json.dumps(canvas, indent=2))
        zf.writestr(f"{folder}/meta.json", json.dumps(meta, indent=2))
        zf.writestr(f"{folder}/assets/manifest.json", json.dumps(manifest, indent=2))
        zf.write(backdrop_path, f"{folder}/assets/{backdrop_id}.jpg")
    return bundle_path


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def write_review(
    out_dir: Path,
    info: VideoInfo,
    transcript: dict[str, Any],
    keyframes: list[Keyframe],
    draft: dict[str, Any],
    bundle_path: Path | None,
    timing: dict[str, Any] | None = None,
) -> None:
    lines = [
        f"# {info.title}",
        "",
        f"- Duration: {ms_to_stamp(info.duration_ms)}",
        f"- Resolution: {info.width}x{info.height}",
        f"- Transcript: {transcript.get('status')} ({transcript.get('source') or transcript.get('model')})",
        f"- Keyframes: {len(keyframes)}",
        f"- Draft symbols: {len(draft.get('symbols', []))}",
        f"- Rejected symbols: {len(draft.get('rejected_symbols', []))}",
        f"- Bundle: {bundle_path if bundle_path else 'not generated'}",
        "",
    ]
    if timing:
        lines.append("## Timing")
        lines.append("")
        for name, seconds in timing.get("stages", {}).items():
            lines.append(f"- {name}: {seconds}s")
        lines.append(f"- total: {timing.get('total')}s")
        lines.append("")
    lines += [
        "## Medical source checks",
        "",
        "- NIH ODS Thiamin fact sheet: thiamin functions as thiamine pyrophosphate in energy metabolism.",
        "- NCI Drug Dictionary: thiamine pyrophosphate is needed for pyruvate dehydrogenase, alpha-ketoglutarate metabolism, and transketolase.",
        "- Merck Manual Professional: erythrocyte transketolase activity can support thiamin deficiency confirmation.",
        "",
        "## Keyframes",
        "",
    ]
    for keyframe in keyframes:
        marker = " (backdrop)" if keyframe.selected_as_backdrop else ""
        lines.append(
            f"- {keyframe.index}: {ms_to_stamp(keyframe.timestamp_ms)}{marker} - `{keyframe.image}`"
        )
    lines.extend(["", "## Draft Symbols", ""])
    for symbol in draft.get("symbols", []):
        lines.append(
            f"- [{symbol.get('confidence', 'unknown')}] {clean_text(symbol.get('symbol_description'))} -> "
            f"{clean_text(symbol.get('meaning'))} ({clean_text(symbol.get('fact'))}) @ "
            f"{ms_to_stamp(int(symbol.get('timestamp_ms') or 0))}"
        )
    rejected = draft.get("rejected_symbols", [])
    if rejected:
        lines.extend(["", "## Rejected Symbols", ""])
        for symbol in rejected:
            lines.append(
                f"- {clean_text(symbol.get('symbol_description')) or 'unknown'}: "
                f"{clean_text(symbol.get('rejection_reason'))}"
            )
    (out_dir / "review.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Local video to Engram draft bundle.")
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--out-root", required=True, type=Path)
    parser.add_argument("--whisper-model", default="small.en")
    parser.add_argument("--skip-transcript", action="store_true")
    parser.add_argument(
        "--captions",
        type=Path,
        default=None,
        help="Explicit caption file (.srt/.vtt) to use as the transcript (skips Whisper).",
    )
    parser.add_argument(
        "--prefer-captions",
        action="store_true",
        help="Try a sidecar/embedded caption track before falling back to Whisper.",
    )
    parser.add_argument(
        "--draft-symbols",
        type=Path,
        default=None,
        help="Load this Claude-authored draft JSON ({model, symbols:[...]}) to build the bundle.",
    )
    parser.add_argument(
        "--reuse-run",
        action="store_true",
        help="Reuse existing video_info.json/keyframes.json/transcript.json in out_dir; skip extraction.",
    )
    parser.add_argument(
        "--backdrop-index",
        type=int,
        default=None,
        help="Force this keyframe index to be the backdrop.",
    )
    parser.add_argument("--max-keyframes", type=int, default=18)
    parser.add_argument("--sample-seconds", type=float, default=3)
    parser.add_argument("--min-gap-seconds", type=float, default=12)
    parser.add_argument("--context-seconds", type=float, default=2)
    parser.add_argument("--diff-threshold", type=float, default=0.08)
    args = parser.parse_args()

    video = args.video
    timer = StageTimer()
    if args.reuse_run:
        out_dir = args.out_root / slugify(video.stem)
        info = VideoInfo(**read_json(out_dir / "video_info.json"))
        keyframes = [Keyframe(**k) for k in read_json(out_dir / "keyframes.json")]
        transcript_path = out_dir / "transcript.json"
        transcript = (
            read_json(transcript_path)
            if transcript_path.exists()
            else {"status": "skipped", "segments": []}
        )
    else:
        if not video.exists():
            raise FileNotFoundError(video)
        info = read_video_info(video)
        out_dir = args.out_root / slugify(info.title)
        ensure_clean_dir(out_dir)
        write_json(out_dir / "video_info.json", asdict(info))

        with timer.time("keyframes"):
            keyframes = extract_keyframes(
                video=video,
                out_dir=out_dir,
                sample_seconds=args.sample_seconds,
                min_gap_seconds=args.min_gap_seconds,
                max_keyframes=args.max_keyframes,
                context_seconds=args.context_seconds,
                diff_threshold=args.diff_threshold,
            )
        write_json(out_dir / "keyframes.json", [asdict(k) for k in keyframes])

        with timer.time("transcript"):
            transcript = get_transcript(
                video,
                out_dir,
                args.whisper_model,
                captions_path=args.captions,
                prefer_captions=args.prefer_captions,
                skip_transcript=args.skip_transcript,
            )
        write_json(out_dir / "transcript.json", transcript)

    if args.backdrop_index is not None:
        for keyframe in keyframes:
            keyframe.selected_as_backdrop = keyframe.index == args.backdrop_index

    with timer.time("draft"):
        if args.draft_symbols is not None:
            draft = read_json(args.draft_symbols)
        else:
            # Claude is the vision model: without an authored draft this is an
            # extract-only run (frames + transcript), no symbols.
            draft = {"model": "claude-as-vlm", "symbols": []}
    with timer.time("bundle"):
        bundle_path = make_bundle(out_dir, info, keyframes, draft)
    write_json(out_dir / "draft_symbols.json", draft)
    timing = {
        "video": slugify(info.title),
        "stages": timer.stages,
        "transcript_source": transcript.get("source") or transcript.get("model"),
        "total": timer.total(),
    }
    write_json(out_dir / "timing.json", timing)
    write_review(out_dir, info, transcript, keyframes, draft, bundle_path, timing)

    print(
        json.dumps(
            {
                "out_dir": str(out_dir),
                "bundle": str(bundle_path) if bundle_path else None,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
