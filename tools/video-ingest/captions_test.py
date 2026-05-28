import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from captions import (
    captions_to_transcript,
    find_sidecar_captions,
    get_transcript,
    parse_srt,
    parse_vtt,
)


class CaptionParserTest(unittest.TestCase):
    def test_parse_srt_basic(self) -> None:
        text = (
            "1\n00:00:01,000 --> 00:00:03,500\nHello world\n\n"
            "2\n00:00:04,000 --> 00:00:06,000\nSecond line\n"
        )
        segs = parse_srt(text)
        self.assertEqual(len(segs), 2)
        self.assertEqual(
            segs[0], {"start_ms": 1000, "end_ms": 3500, "text": "Hello world"}
        )
        self.assertEqual(segs[1]["start_ms"], 4000)

    def test_parse_vtt_header_and_short_timestamp(self) -> None:
        text = (
            "WEBVTT\n\n"
            "NOTE this is a note\n\n"
            "00:01.000 --> 00:03.000 align:start position:0%\n"
            "<c>Pixorize</c> intro\n"
        )
        segs = parse_vtt(text)
        self.assertEqual(len(segs), 1)
        self.assertEqual(segs[0]["start_ms"], 1000)
        self.assertEqual(segs[0]["end_ms"], 3000)
        self.assertEqual(segs[0]["text"], "Pixorize intro")

    def test_parse_vtt_strips_voice_and_timing_tags(self) -> None:
        text = (
            "WEBVTT\n\n"
            "00:00:00.000 --> 00:00:02.000\n"
            "<v Narrator><00:00:00.500>that's a <c>pirate</c>\n"
        )
        segs = parse_vtt(text)
        self.assertEqual(segs[0]["text"], "that's a pirate")

    def test_hours_and_minutes_timestamp_math(self) -> None:
        text = "1\n01:02:03,250 --> 01:02:04,000\nLate cue\n"
        segs = parse_srt(text)
        self.assertEqual(segs[0]["start_ms"], (1 * 3600 + 2 * 60 + 3) * 1000 + 250)

    def test_exact_duplicate_cues_collapse(self) -> None:
        text = (
            "WEBVTT\n\n"
            "00:00:00.000 --> 00:00:02.000\nHello world\n\n"
            "00:00:02.000 --> 00:00:04.000\nHello world\n"
        )
        segs = parse_vtt(text)
        self.assertEqual(len(segs), 1)
        self.assertEqual(segs[0]["end_ms"], 4000)

    def test_rolling_rollup_keeps_only_new_words(self) -> None:
        text = (
            "WEBVTT\n\n"
            "00:00:00.000 --> 00:00:02.000\nHello world\n\n"
            "00:00:02.000 --> 00:00:04.000\nHello world how are you\n"
        )
        segs = parse_vtt(text)
        self.assertEqual([s["text"] for s in segs], ["Hello world", "how are you"])

    def test_captions_to_transcript_shape(self) -> None:
        segs = [{"start_ms": 0, "end_ms": 1000, "text": "x"}]
        t = captions_to_transcript(segs, "sidecar", "en")
        self.assertEqual(t["status"], "ok")
        self.assertEqual(t["model"], "captions:sidecar")
        self.assertEqual(t["source"], "sidecar")
        self.assertEqual(t["language"], "en")
        self.assertEqual(t["segments"], segs)


class SidecarDiscoveryTest(unittest.TestCase):
    def test_prefers_english_then_srt(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            base = Path(d) / "My Video.mp4"
            base.write_bytes(b"")
            (Path(d) / "My Video.vtt").write_text("WEBVTT\n", encoding="utf-8")
            (Path(d) / "My Video.en.srt").write_text("", encoding="utf-8")
            found = find_sidecar_captions(base)
            self.assertEqual(found.name, "My Video.en.srt")

    def test_plain_sidecar_match(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            base = Path(d) / "clip.mp4"
            base.write_bytes(b"")
            (Path(d) / "clip.srt").write_text("", encoding="utf-8")
            self.assertEqual(find_sidecar_captions(base).name, "clip.srt")

    def test_none_when_absent(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            base = Path(d) / "clip.mp4"
            base.write_bytes(b"")
            self.assertIsNone(find_sidecar_captions(base))


class GetTranscriptTest(unittest.TestCase):
    def test_explicit_captions_skip_whisper_and_write_srt(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            cap = out / "subs.srt"
            cap.write_text("1\n00:00:01,000 --> 00:00:02,000\nhi\n", encoding="utf-8")
            t = get_transcript(
                video=Path(d) / "missing.mp4",
                out_dir=out,
                model_name="small.en",
                captions_path=cap,
            )
            self.assertEqual(t["model"], "captions:explicit")
            self.assertEqual(len(t["segments"]), 1)
            self.assertTrue((out / "transcript.srt").exists())

    def test_skip_transcript(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = get_transcript(Path("x.mp4"), Path(d), "small.en", skip_transcript=True)
            self.assertEqual(t["status"], "skipped")


if __name__ == "__main__":
    unittest.main()
