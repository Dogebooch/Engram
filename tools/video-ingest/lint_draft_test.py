import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lint_draft import lint


def write_run(run_dir: Path, transcript=None, ocr=None, draft=None) -> Path:
    if transcript is not None:
        (run_dir / "transcript.json").write_text(
            json.dumps(transcript), encoding="utf-8"
        )
    if ocr is not None:
        (run_dir / "ocr.json").write_text(json.dumps(ocr), encoding="utf-8")
    draft_path = run_dir / "draft_symbols.json"
    draft_path.write_text(json.dumps(draft or {"symbols": []}), encoding="utf-8")
    return draft_path


TRANSCRIPT = {
    "segments": [
        {
            "text": "abducens nerve controls the lateral rectus and the trochlear nerve too"
        }
    ]
}
# Real on-screen labels mixed with watermark/garble that is NEVER spoken.
OCR = {
    "segments": [{"text": "Pixorize v1.0.0 Abducens Nerve Lateral Rectus Trochlear"}]
}
# Draft captures every label EXCEPT "trochlear".
DRAFT = {
    "symbols": [
        {
            "order": 0,
            "fact": "Abducens nerve",
            "symbol_key": "abu",
            "symbol_description": "the abducens flag on the wall",
            "meaning": "abducens nerve lateral rectus",
            "evidence": 'Transcript @0:00 "abducens nerve controls the lateral rectus"',
            "timestamp_ms": 0,
        }
    ],
}


class OcrCoverageTest(unittest.TestCase):
    def test_intersection_excludes_watermarks_and_scores_coverage(self) -> None:
        # Covers: spoken label counted, watermark excluded, dropped label missing.
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(run_dir, TRANSCRIPT, OCR, DRAFT)
            stats = lint(run_dir, draft_path)["stats"]

        # Pixorize / v1 / 0 are in OCR but not spoken -> dropped from the term set.
        # The real answer key is {abducens, lateral, nerve, rectus, trochlear} = 5.
        self.assertEqual(stats["ocr_terms"], 5)
        # "trochlear" is the only label the draft omitted.
        self.assertEqual(stats["missing_terms"], ["trochlear"])
        self.assertEqual(stats["ocr_coverage"], 0.8)

    def test_absent_ocr_yields_null_coverage_and_dense_floor_warns(self) -> None:
        # Facts-only gate: under-extraction is ADVISORY (a warning, not an error).
        dense_transcript = {"segments": [{"text": "the nerve appears here"}] * 250}
        draft = {
            "symbols": [
                {
                    "order": 0,
                    "fact": "lone fact",
                    "symbol_key": "lone",
                    "symbol_description": "a single thing",
                    "meaning": "one meaning",
                    "evidence": 'Transcript @0:00 "the nerve appears here"',
                    "timestamp_ms": 0,
                }
            ],
        }
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(run_dir, dense_transcript, None, draft)
            result = lint(run_dir, draft_path)

        self.assertIsNone(result["stats"]["ocr_coverage"])
        self.assertEqual(result["stats"]["ocr_terms"], 0)
        self.assertTrue(result["ok"])
        self.assertTrue(
            any(w["code"] == "possible-under-extraction" for w in result["warnings"])
        )

    def test_ocr_supported_missing_terms_warn(self) -> None:
        # Facts-only gate: low OCR coverage is ADVISORY (a warning, not an error).
        transcript = {
            "segments": [
                {
                    "start_ms": 0,
                    "text": "abducens lateral rectus trochlear facial vagus nerve",
                }
            ]
        }
        ocr = {
            "segments": [
                {
                    "start_ms": 0,
                    "text": "abducens lateral rectus trochlear facial vagus nerve",
                }
            ]
        }
        draft = {
            "symbols": [
                {
                    "order": 0,
                    "fact": "Abducens lateral rectus",
                    "symbol_key": "nerves",
                    "symbol_description": "nerve labels across the board",
                    "meaning": "Nerve labels represent abducens lateral rectus content",
                    "evidence": 'Transcript @0:00 "abducens lateral rectus trochlear facial vagus nerve"',
                    "timestamp_ms": 0,
                }
            ],
        }
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(run_dir, transcript, ocr, draft)
            result = lint(run_dir, draft_path)

        self.assertTrue(result["ok"])
        self.assertIn("vagus", result["stats"]["missing_terms"])
        self.assertTrue(
            any(w["code"] == "possible-under-extraction" for w in result["warnings"])
        )


if __name__ == "__main__":
    unittest.main()
