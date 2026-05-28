import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from intro_frames import (
    nearest_keyframe_index,
    resolve_intro_ms,
    target_frame_number,
)

TRANSCRIPT = {
    "status": "ok",
    "segments": [
        {
            "start_ms": 50_000,
            "end_ms": 55_000,
            "text": "This mighty thigh means thiamine.",
        },
        {
            "start_ms": 190_000,
            "end_ms": 200_000,
            "text": "That's a pirate, pyruvate dehydrogenase.",
        },
    ],
}


class ResolveIntroTest(unittest.TestCase):
    def test_phrase_match_wins(self) -> None:
        symbol = {
            "order": 3,
            "timestamp_ms": 999_000,
            "intro_phrases": ["that's a pirate"],
        }
        ms, by = resolve_intro_ms(TRANSCRIPT, symbol, 439_000, 3, 8)
        self.assertEqual(by, "phrase")
        self.assertEqual(ms, 190_000)

    def test_timestamp_when_no_phrase_match(self) -> None:
        symbol = {
            "order": 3,
            "timestamp_ms": 250_000,
            "intro_phrases": ["no such line"],
        }
        ms, by = resolve_intro_ms(TRANSCRIPT, symbol, 439_000, 3, 8)
        self.assertEqual(by, "timestamp")
        self.assertEqual(ms, 250_000)

    def test_order_interpolation_fallback(self) -> None:
        symbol = {"order": 3}
        ms, by = resolve_intro_ms(TRANSCRIPT, symbol, 800_000, 3, 7)
        self.assertEqual(by, "order")
        self.assertEqual(ms, int(800_000 * 4 / 8))

    def test_no_phrases_uses_timestamp(self) -> None:
        symbol = {"order": 0, "timestamp_ms": 1234}
        ms, by = resolve_intro_ms(TRANSCRIPT, symbol, 439_000, 0, 8)
        self.assertEqual((ms, by), (1234, "timestamp"))


class FrameMathTest(unittest.TestCase):
    def test_frame_number_from_ms(self) -> None:
        self.assertEqual(target_frame_number(1000, 30.0, 10_000), 30)

    def test_clamped_to_last_frame(self) -> None:
        self.assertEqual(target_frame_number(10_000_000, 30.0, 100), 99)

    def test_never_negative(self) -> None:
        self.assertEqual(target_frame_number(-500, 30.0, 100), 0)


class NearestKeyframeTest(unittest.TestCase):
    def test_picks_closest(self) -> None:
        keyframes = [
            {"timestamp_ms": 0},
            {"timestamp_ms": 100_000},
            {"timestamp_ms": 200_000},
        ]
        self.assertEqual(nearest_keyframe_index(keyframes, 130_000), 1)
        self.assertEqual(nearest_keyframe_index(keyframes, 180_000), 2)


if __name__ == "__main__":
    unittest.main()
