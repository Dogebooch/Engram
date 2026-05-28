import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest_video import (
    Keyframe,
    VideoInfo,
    extract_transcript_symbols,
    is_placeable_symbol,
)


class VideoIngestQaTest(unittest.TestCase):
    def test_rejects_whole_frame_boxes(self) -> None:
        symbol = {"bbox": {"x": 0, "y": 0, "width": 1280, "height": 720}}

        self.assertFalse(is_placeable_symbol(symbol, 1280, 720))

    def test_extracts_thiamine_transcript_symbols(self) -> None:
        info = VideoInfo(
            path=r"P:\Medicine Videos\Pixorize\Pixorize Biochemistry\1. Vitamins (23)\1. Thiamine (Vitamin B1) Biochemistry.mp4",
            title="1. Thiamine (Vitamin B1) Biochemistry",
            fps=24,
            frames=10_000,
            duration_ms=439_000,
            width=1280,
            height=720,
        )
        transcript = {
            "status": "ok",
            "segments": [
                {"start_ms": 53_000, "end_ms": 59_000, "text": "This mighty thigh is there to make us think of Thiamine."},
                {"start_ms": 103_000, "end_ms": 115_000, "text": "These are teepees, and they represent TPP, or thiamine pyrophosphate."},
                {"start_ms": 160_000, "end_ms": 169_000, "text": "The de-heading the hydra helps us remember dehydrogenase reactions."},
                {"start_ms": 193_000, "end_ms": 210_000, "text": "That's a pirate. Pyruvate dehydrogenase requires TPP."},
                {"start_ms": 252_000, "end_ms": 267_000, "text": "Alpha key and glutes recall alpha-key-toe-glutarate dehydrogenase."},
                {"start_ms": 310_000, "end_ms": 322_000, "text": "A tree branch attached to a chain represents branched-chain keto-acid dehydrogenase."},
                {"start_ms": 361_000, "end_ms": 371_000, "text": "This key-carrying train signifies trains-ketolase."},
                {"start_ms": 399_000, "end_ms": 408_000, "text": "It helps in diagnosis of a vitamin B1 deficiency by measurable increase in activity."},
            ],
        }
        keyframes = [
            Keyframe(
                index=0,
                timestamp_ms=411_000,
                frame_number=9864,
                image="final.jpg",
                diff_score=1,
                context_before=[],
                context_after=[],
                selected_as_backdrop=True,
            )
        ]

        draft = extract_transcript_symbols(info, transcript, keyframes)

        self.assertEqual(len(draft["symbols"]), 8)
        self.assertEqual(
            len({s["symbol_key"] for s in draft["symbols"]}),
            7,
        )


if __name__ == "__main__":
    unittest.main()
