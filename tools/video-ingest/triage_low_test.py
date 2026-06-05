from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import triage_low


class TriageLowTest(unittest.TestCase):
    def test_legit_small_control_is_not_forced_to_reingest(self) -> None:
        rec = {
            "lint_found": True,
            "warning_codes": [],
            "ocr_coverage": 0.94,
            "segments": 55,
            "missing_terms": [],
        }

        self.assertEqual(triage_low.classify(rec), "legit_small")

    def test_high_coverage_under_extraction_flag_stays_borderline(self) -> None:
        rec = {
            "lint_found": True,
            "warning_codes": ["possible-under-extraction"],
            "ocr_coverage": 0.82,
            "segments": 70,
            "missing_terms": ["recap"],
        }

        self.assertEqual(triage_low.classify(rec), "borderline")

    def test_low_coverage_under_extraction_goes_to_rebuild(self) -> None:
        rec = {
            "lint_found": True,
            "warning_codes": ["possible-under-extraction"],
            "ocr_coverage": 0.48,
            "segments": 120,
            "missing_terms": ["phoenix", "phone"],
        }

        self.assertEqual(triage_low.classify(rec), "under_extracted")


if __name__ == "__main__":
    unittest.main()
