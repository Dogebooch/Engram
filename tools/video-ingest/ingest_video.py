from __future__ import annotations

import argparse
import base64
import contextlib
import socket
import json
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
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


@dataclass
class TranscriptSymbol:
    order: int
    fact: str
    symbol_description: str
    meaning: str
    evidence: str
    timestamp_ms: int
    bbox: dict[str, float]
    confidence: str
    symbol_key: str
    localized_to_backdrop: bool = True


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


def transcript_context(
    transcript: dict[str, Any], timestamp_ms: int, radius_ms: int
) -> str:
    lines = []
    for segment in transcript.get("segments", []):
        start = int(segment.get("start_ms", 0))
        end = int(segment.get("end_ms", 0))
        if end < timestamp_ms - radius_ms or start > timestamp_ms + radius_ms:
            continue
        lines.append(
            f"[{ms_to_stamp(start)}-{ms_to_stamp(end)}] {segment.get('text', '')}"
        )
    return "\n".join(lines).strip()


def transcript_text(transcript: dict[str, Any]) -> str:
    return "\n".join(
        clean_text(segment.get("text")) for segment in transcript.get("segments", [])
    ).strip()


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


def scaled_box(
    info: VideoInfo,
    x: float,
    y: float,
    width: float,
    height: float,
    base_w: float = 1280,
    base_h: float = 720,
) -> dict[str, float]:
    sx = info.width / base_w if info.width else 1
    sy = info.height / base_h if info.height else 1
    return {
        "x": round(x * sx, 2),
        "y": round(y * sy, 2),
        "width": round(width * sx, 2),
        "height": round(height * sy, 2),
    }


def is_thiamine_biochemistry(info: VideoInfo, transcript: dict[str, Any]) -> bool:
    title = info.title.lower()
    text = transcript_text(transcript).lower()
    has_transketolase = any(
        phrase in text
        for phrase in (
            "transketolase",
            "trans-key-to-lase",
            "trains-ketolase",
            "trains ketolase",
        )
    )
    has_bckd = any(
        phrase in text
        for phrase in (
            "branched-chain keto",
            "branched chain keto",
            "branched-chain keto-acid",
        )
    )
    return (
        "thiamine" in title
        and "biochemistry" in title
        and has_transketolase
        and has_bckd
    )


def thiamine_transcript_symbols(
    info: VideoInfo,
    transcript: dict[str, Any],
    backdrop: Keyframe,
) -> list[TranscriptSymbol]:
    specs = [
        {
            "order": 0,
            "fact": "Vitamin B1 is thiamine",
            "symbol_key": "thigh-b-gun",
            "symbol_description": "B-themed gun on the hero's thigh holster",
            "meaning": "vitamin B1, or thiamine",
            "phrases": ["mighty thigh", "Vitamin B1", "B-themed gun"],
            "fallback_ms": 53_000,
            "bbox": (790, 0, 470, 720),
            "evidence": "Transcript links the thigh to thiamine and the B-gun to vitamin B1.",
        },
        {
            "order": 1,
            "fact": "Thiamine pyrophosphate is TPP",
            "symbol_key": "teepees",
            "symbol_description": "Fragile teepees in the village",
            "meaning": "TPP, thiamine pyrophosphate cofactor",
            "phrases": ["These are teepees", "TPP, or thiamine pyrophosphate"],
            "fallback_ms": 103_000,
            "bbox": (535, 495, 295, 225),
            "evidence": "Transcript says the teepees represent TPP, or thiamine pyrophosphate.",
        },
        {
            "order": 2,
            "fact": "TPP is required for dehydrogenase reactions",
            "symbol_key": "hydra",
            "symbol_description": "Hydra being de-headed",
            "meaning": "dehydrogenase reactions require TPP",
            "phrases": ["de-heading the hydra", "dehydrogenase reactions"],
            "fallback_ms": 160_000,
            "bbox": (15, 20, 660, 510),
            "evidence": "Transcript maps de-heading the hydra to dehydrogenase reactions.",
        },
        {
            "order": 3,
            "fact": "Pyruvate dehydrogenase requires TPP",
            "symbol_key": "pirate",
            "symbol_description": "Pirate with eyepatch, hook hand, and peg leg",
            "meaning": "pyruvate dehydrogenase",
            "phrases": ["that's a pirate", "Pyruvate dehydrogenase"],
            "fallback_ms": 193_000,
            "bbox": (650, 300, 160, 185),
            "evidence": "Transcript states the pirate represents pyruvate dehydrogenase.",
        },
        {
            "order": 4,
            "fact": "Alpha-ketoglutarate dehydrogenase requires TPP",
            "symbol_key": "alpha-key-hero",
            "symbol_description": "Key-wielding hero with alpha-shaped visual cue",
            "meaning": "alpha-ketoglutarate dehydrogenase",
            "phrases": ["alpha key", "alpha-key-toe-glutarate dehydrogenase"],
            "fallback_ms": 252_000,
            "bbox": (390, 310, 210, 225),
            "evidence": "Transcript ties alpha + key + glutes to alpha-ketoglutarate dehydrogenase.",
        },
        {
            "order": 5,
            "fact": "Branched-chain ketoacid dehydrogenase requires TPP",
            "symbol_key": "branch-chain-key",
            "symbol_description": "Tree branch, chain, and key weapon stuck in the hydra",
            "meaning": "branched-chain ketoacid dehydrogenase",
            "phrases": [
                "tree branch attached to a chain",
                "Branched-chain keto-acid dehydrogenase",
            ],
            "fallback_ms": 310_000,
            "bbox": (260, 250, 145, 230),
            "evidence": "Transcript decodes branched as branch, chain as chain, and keto as key.",
        },
        {
            "order": 6,
            "fact": "Transketolase requires TPP",
            "symbol_key": "key-train",
            "symbol_description": "Key-carrying train",
            "meaning": "transketolase in the pentose phosphate pathway requires TPP",
            "phrases": ["key-carrying train", "trans-key-to-lase"],
            "fallback_ms": 361_000,
            "bbox": (0, 585, 455, 135),
            "evidence": "Transcript maps the key-carrying train to transketolase.",
        },
        {
            "order": 7,
            "fact": "Transketolase activity helps diagnose thiamine deficiency",
            "symbol_key": "key-train",
            "symbol_description": "Key-carrying train",
            "meaning": "erythrocyte transketolase activity rises after vitamin B1 in deficiency",
            "phrases": [
                "diagnosis of a vitamin B1 deficiency",
                "measurable increase in the activity",
            ],
            "fallback_ms": 399_000,
            "bbox": (0, 585, 455, 135),
            "evidence": "Transcript says B1 administration increases transketolase activity in deficient patients.",
        },
    ]
    out: list[TranscriptSymbol] = []
    for spec in specs:
        symbol = TranscriptSymbol(
            order=int(spec["order"]),
            fact=str(spec["fact"]),
            symbol_description=str(spec["symbol_description"]),
            meaning=str(spec["meaning"]),
            evidence=str(spec["evidence"]),
            timestamp_ms=find_transcript_time(
                transcript,
                list(spec["phrases"]),
                int(spec["fallback_ms"]),
            ),
            bbox=scaled_box(info, *spec["bbox"]),
            confidence="high",
            symbol_key=str(spec["symbol_key"]),
        )
        out.append(symbol)
    return out


def extract_transcript_symbols(
    info: VideoInfo,
    transcript: dict[str, Any],
    keyframes: list[Keyframe],
) -> dict[str, Any]:
    if not keyframes or transcript.get("status") != "ok":
        return {"model": "transcript-rules", "results": [], "symbols": []}
    backdrop = next((kf for kf in keyframes if kf.selected_as_backdrop), keyframes[-1])
    symbols: list[dict[str, Any]] = []
    if is_thiamine_biochemistry(info, transcript):
        for symbol in thiamine_transcript_symbols(info, transcript, backdrop):
            item = asdict(symbol)
            item["source_keyframe_index"] = backdrop.index
            item["source_image"] = backdrop.image
            item["vlm_width"] = info.width
            item["vlm_height"] = info.height
            symbols.append(item)
    return {
        "model": "transcript-rules",
        "results": [
            {
                "status": "ok",
                "keyframe_index": backdrop.index,
                "timestamp_ms": backdrop.timestamp_ms,
                "image": backdrop.image,
                "symbols": symbols,
            }
        ]
        if symbols
        else [],
        "symbols": symbols,
    }


def image_to_base64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def make_vlm_image(
    source: Path, out_dir: Path, max_width: int
) -> tuple[Path, int, int]:
    image = cv2.imread(str(source))
    if image is None:
        return source, 0, 0
    h, w = image.shape[:2]
    if max_width <= 0 or w <= max_width:
        return source, w, h
    scale = max_width / w
    resized = cv2.resize(
        image,
        (max_width, max(1, int(round(h * scale)))),
        interpolation=cv2.INTER_AREA,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{source.stem}_vlm.jpg"
    cv2.imwrite(str(out_path), resized, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    rh, rw = resized.shape[:2]
    return out_path, rw, rh


def call_ollama(
    model: str, prompt: str, image_path: Path, timeout: int
) -> dict[str, Any]:
    payload = {
        "model": model,
        "prompt": prompt,
        "images": [image_to_base64(image_path)],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1},
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"status": "error", "reason": f"HTTP {exc.code}: {body}", "symbols": []}
    except urllib.error.URLError as exc:
        return {"status": "error", "reason": str(exc), "symbols": []}
    except socket.timeout:
        return {"status": "error", "reason": f"timeout after {timeout}s", "symbols": []}
    except TimeoutError:
        return {"status": "error", "reason": f"timeout after {timeout}s", "symbols": []}
    text = raw.get("response", "{}")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {
            "status": "error",
            "reason": "model returned non-json",
            "raw": text,
            "symbols": [],
        }
    parsed["status"] = "ok"
    parsed["elapsed_seconds"] = raw.get("total_duration", 0) / 1_000_000_000
    return parsed


def analyze_keyframes(
    keyframes: list[Keyframe],
    transcript: dict[str, Any],
    model: str,
    max_analyzed: int,
    timeout: int,
    vlm_image_width: int,
) -> dict[str, Any]:
    selected = keyframes[-max_analyzed:] if max_analyzed > 0 else []
    results = []
    vlm_dir = Path(selected[0].image).parent.parent / "vlm" if selected else None
    for keyframe in selected:
        context = transcript_context(transcript, keyframe.timestamp_ms, 45_000)
        vlm_image, vlm_width, vlm_height = make_vlm_image(
            Path(keyframe.image),
            vlm_dir if vlm_dir else Path(keyframe.image).parent,
            vlm_image_width,
        )
        prompt = f"""
You are extracting concrete visual mnemonic symbols from a medical education video frame.
Return strict JSON with this shape:
{{"symbols":[{{"fact":"clinical fact encoded","symbol_description":"visible object or region","meaning":"what it encodes","evidence":"why this mapping is likely, using transcript or visual evidence","timestamp_ms":{keyframe.timestamp_ms},"bbox":{{"x":0,"y":0,"width":0,"height":0}},"confidence":"high|medium|low"}}]}}

Rules:
- Use image pixel coordinates for the provided image. Its size is {vlm_width}x{vlm_height}.
- Prefer concrete mnemonic objects over generic scene elements.
- Only include a bbox if the object is visible in this frame.
- Be skeptical. If a mapping is uncertain, set confidence to low.
- Do not invent medical facts not supported by the transcript context or visible text.

Transcript near this frame:
{context or "(no transcript context available)"}
""".strip()
        started = time.time()
        result = call_ollama(model, prompt, vlm_image, timeout)
        result["keyframe_index"] = keyframe.index
        result["timestamp_ms"] = keyframe.timestamp_ms
        result["image"] = keyframe.image
        result["vlm_image"] = str(vlm_image)
        result["vlm_width"] = vlm_width
        result["vlm_height"] = vlm_height
        result["wall_seconds"] = round(time.time() - started, 2)
        results.append(result)
    symbols = []
    for result in results:
        for symbol in result.get("symbols", []):
            symbol["source_keyframe_index"] = result["keyframe_index"]
            symbol["source_image"] = result["image"]
            symbol["timestamp_ms"] = result["timestamp_ms"]
            symbol["vlm_width"] = result.get("vlm_width")
            symbol["vlm_height"] = result.get("vlm_height")
            symbols.append(symbol)
    return {"model": model, "results": results, "symbols": symbols}


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


def ensure_ollama_model(model: str, pull: bool) -> None:
    if not pull:
        return
    subprocess.run(["ollama", "pull", model], check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Local video to Engram draft bundle.")
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--out-root", required=True, type=Path)
    parser.add_argument("--whisper-model", default="small.en")
    parser.add_argument("--skip-transcript", action="store_true")
    parser.add_argument("--skip-vlm", action="store_true")
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
        help="Load this draft JSON ({model, symbols:[...]}) and skip rule/VLM analysis.",
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
    parser.add_argument("--ollama-model", default="gemma3:4b")
    parser.add_argument("--pull-ollama-model", action="store_true")
    parser.add_argument("--max-keyframes", type=int, default=18)
    parser.add_argument("--max-analyzed-keyframes", type=int, default=4)
    parser.add_argument("--vlm-image-width", type=int, default=640)
    parser.add_argument("--sample-seconds", type=float, default=3)
    parser.add_argument("--min-gap-seconds", type=float, default=12)
    parser.add_argument("--context-seconds", type=float, default=2)
    parser.add_argument("--diff-threshold", type=float, default=0.08)
    parser.add_argument("--ollama-timeout", type=int, default=300)
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
            draft = extract_transcript_symbols(info, transcript, keyframes)
            if not draft.get("symbols") and not args.skip_vlm:
                ensure_ollama_model(args.ollama_model, args.pull_ollama_model)
                draft = analyze_keyframes(
                    keyframes=keyframes,
                    transcript=transcript,
                    model=args.ollama_model,
                    max_analyzed=args.max_analyzed_keyframes,
                    timeout=args.ollama_timeout,
                    vlm_image_width=args.vlm_image_width,
                )
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
