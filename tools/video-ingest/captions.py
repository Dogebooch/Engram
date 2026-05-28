"""Caption/subtitle ingestion for the video pipeline.

Produces the same transcript shape `transcribe()` emits in ingest_video.py
({status, model, language, language_probability, elapsed_seconds, segments:[
{start_ms,end_ms,text}]}) so downstream code is unchanged. Resolution order is
explicit path -> sidecar file -> embedded stream -> Whisper fallback.

Stdlib-only on the hot path (parsers + sidecar detection); embedded extraction
uses PyAV (already a dependency) best-effort, and the Whisper fallback is
imported lazily to avoid a circular import with ingest_video.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

Segment = dict[str, Any]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _strip_tags(text: str) -> str:
    # WebVTT inline tags (<c>, <v Speaker>, <00:00:01.000>) and any stray markup.
    return re.sub(r"<[^>]+>", "", text)


def _parse_ts(value: str) -> int | None:
    """Parse `HH:MM:SS.mmm`, `MM:SS.mmm`, or the SRT comma variant into ms."""
    s = value.strip().replace(",", ".")
    if not s:
        return None
    parts = s.split(":")
    if len(parts) == 3:
        h, m, rest = parts
    elif len(parts) == 2:
        h, m, rest = "0", parts[0], parts[1]
    else:
        return None
    if "." in rest:
        sec, frac = rest.split(".", 1)
    else:
        sec, frac = rest, "0"
    try:
        frac_ms = int((frac + "000")[:3])
        return (int(h) * 3600 + int(m) * 60 + int(sec)) * 1000 + frac_ms
    except ValueError:
        return None


def _split_blocks(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    return re.split(r"\n\s*\n", normalized)


def _parse_block(lines: list[str]) -> Segment | None:
    timing_idx = next((i for i, l in enumerate(lines) if "-->" in l), None)
    if timing_idx is None:
        return None
    start_raw, _, rest = lines[timing_idx].partition("-->")
    # End timestamp may be followed by cue settings (VTT) — keep the first token.
    end_raw = rest.strip().split(" ", 1)[0]
    start_ms = _parse_ts(start_raw)
    end_ms = _parse_ts(end_raw)
    if start_ms is None or end_ms is None:
        return None
    text = _clean(_strip_tags(" ".join(lines[timing_idx + 1 :])))
    if not text:
        return None
    return {"start_ms": start_ms, "end_ms": max(end_ms, start_ms), "text": text}


def _merge_rolling_duplicates(segments: list[Segment]) -> list[Segment]:
    """Collapse the redundancy auto-captions produce: exact repeats and the
    rollup where each cue restates the previous line then appends new words."""
    out: list[Segment] = []
    for seg in segments:
        text = seg["text"]
        if out:
            prev = out[-1]["text"]
            if text == prev:
                out[-1]["end_ms"] = seg["end_ms"]
                continue
            if text.startswith(prev + " "):
                text = text[len(prev) :].strip()
            elif prev.endswith(text) and len(text) < len(prev):
                continue
        if text:
            out.append({**seg, "text": text})
    return out


def parse_srt(text: str) -> list[Segment]:
    segments = [
        seg
        for block in _split_blocks(text)
        if (seg := _parse_block(block.split("\n"))) is not None
    ]
    return _merge_rolling_duplicates(segments)


def parse_vtt(text: str) -> list[Segment]:
    segments: list[Segment] = []
    for block in _split_blocks(text):
        head = block.lstrip()
        if head.startswith(("WEBVTT", "NOTE", "STYLE", "REGION")):
            continue
        seg = _parse_block(block.split("\n"))
        if seg is not None:
            segments.append(seg)
    return _merge_rolling_duplicates(segments)


def parse_caption_file(path: Path) -> list[Segment]:
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    if Path(path).suffix.lower() == ".vtt":
        return parse_vtt(text)
    return parse_srt(text)


def find_sidecar_captions(video: Path) -> Path | None:
    """Return the best sidecar caption next to the video, preferring English
    then .srt. Matches `<stem>.srt/.vtt` and `<stem>.<lang>.srt/.vtt`."""
    video = Path(video)
    parent = video.parent
    stem = video.stem
    if not parent.exists():
        return None
    candidates = [
        p
        for p in parent.iterdir()
        if p.is_file()
        and p.suffix.lower() in (".srt", ".vtt")
        and (p.stem == stem or p.stem.startswith(stem + "."))
    ]
    if not candidates:
        return None

    def rank(p: Path) -> tuple[int, int, int]:
        name = p.name.lower()
        is_english = ".en" in name.replace(stem.lower(), "")
        return (
            0 if is_english else 1,
            0 if p.suffix.lower() == ".srt" else 1,
            len(name),
        )

    candidates.sort(key=rank)
    return candidates[0]


def read_embedded_segments(
    video: Path, stream_index: int | None = None
) -> tuple[list[Segment], str | None]:
    """Best-effort decode of an embedded text-subtitle stream via PyAV. Returns
    ([], None) for bitmap subs, missing streams, or any failure (caller then
    falls back to Whisper)."""
    try:
        import av
        from av.subtitles.subtitle import AssSubtitle, TextSubtitle
    except Exception:
        return [], None

    segments: list[Segment] = []
    language: str | None = None
    try:
        container = av.open(str(video))
    except Exception:
        return [], None
    try:
        subs = list(container.streams.subtitles)
        if not subs:
            return [], None
        if stream_index is not None:
            stream = next((s for s in subs if s.index == stream_index), None)
        else:
            stream = next(
                (
                    s
                    for s in subs
                    if (s.metadata or {}).get("language", "").startswith("en")
                ),
                subs[0],
            )
        if stream is None:
            return [], None
        language = (stream.metadata or {}).get("language")
        for packet in container.demux(stream):
            if packet.pts is None or packet.time_base is None:
                continue
            try:
                decoded = packet.decode()
            except Exception:
                continue
            start_ms = int(float(packet.pts * packet.time_base) * 1000)
            dur = packet.duration or 0
            end_ms = start_ms + int(float(dur * packet.time_base) * 1000)
            texts: list[str] = []
            for sub_set in decoded:
                for sub in sub_set:
                    if isinstance(sub, AssSubtitle):
                        ass = sub.ass
                        ass = (
                            ass.decode("utf-8", "replace")
                            if isinstance(ass, bytes)
                            else ass
                        )
                        # ASS dialogue: text is the last comma-separated field.
                        texts.append(ass.split(",", 9)[-1].replace("\\N", " "))
                    elif isinstance(sub, TextSubtitle):
                        t = sub.text
                        texts.append(
                            t.decode("utf-8", "replace") if isinstance(t, bytes) else t
                        )
            text = _clean(_strip_tags(" ".join(t for t in texts if t)))
            if text:
                segments.append(
                    {
                        "start_ms": start_ms,
                        "end_ms": max(end_ms, start_ms),
                        "text": text,
                    }
                )
    except Exception:
        return [], None
    finally:
        container.close()
    return _merge_rolling_duplicates(segments), language


def _srt_time(ms: int) -> str:
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, milli = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"


def write_srt(segments: list[Segment], path: Path) -> None:
    lines: list[str] = []
    for i, seg in enumerate(segments, start=1):
        lines.extend(
            [
                str(i),
                f"{_srt_time(int(seg['start_ms']))} --> {_srt_time(int(seg['end_ms']))}",
                seg["text"],
                "",
            ]
        )
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def captions_to_transcript(
    segments: list[Segment], source: str, language: str | None = None
) -> dict[str, Any]:
    return {
        "status": "ok" if segments else "empty",
        "model": f"captions:{source}",
        "source": source,
        "language": language,
        "language_probability": None,
        "elapsed_seconds": 0.0,
        "segments": segments,
    }


def get_transcript(
    video: Path,
    out_dir: Path,
    model_name: str,
    captions_path: Path | None = None,
    prefer_captions: bool = False,
    skip_transcript: bool = False,
) -> dict[str, Any]:
    """Single transcript entry point. Tries captions first when an explicit
    path is given or `prefer_captions` is set, otherwise falls back to Whisper."""
    if skip_transcript:
        return {"status": "skipped", "segments": []}

    segments: list[Segment] | None = None
    source: str | None = None
    language: str | None = None

    if captions_path is not None:
        segments = parse_caption_file(captions_path)
        source = "explicit"
    elif prefer_captions:
        sidecar = find_sidecar_captions(video)
        if sidecar is not None:
            segments = parse_caption_file(sidecar)
            source = "sidecar"
        else:
            embedded, language = read_embedded_segments(video)
            if embedded:
                segments = embedded
                source = "embedded"

    if segments:
        write_srt(segments, Path(out_dir) / "transcript.srt")
        return captions_to_transcript(segments, source or "captions", language)

    from ingest_video import transcribe

    return transcribe(video, out_dir, model_name)
