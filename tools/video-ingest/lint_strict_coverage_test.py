"""PARKED SPEC — strict-coverage gate (NOT implemented as a draft linter).

These tests were authored against `lint_draft.lint()`, asserting it produces a
strict-coverage / house-style layer: `uncovered-target`, `invalid-omission`,
`weak-fact`, `weak-meaning`, `banned-character`, `bad-evidence-fragment`,
`missing-critical-terms`, the `suspicious-symbol-overlap` warning, per-symbol
evidence grounding near the cited `evidence_start_ms`, and the
`coverage_uncovered` / `missing_critical_terms` stat keys.

The canonical `lint_draft.py` is the **facts-only** free gate by design (see the
ingest-factsonly-gate decision: it must stay facts-only — a coverage/geometry
rewrite once clobbered it and false-failed a whole batch). It does not implement
any of the above, so as written these assertions describe a draft-level strict
gate that has never been built.

These classes are therefore skipped, not deleted: they remain the spec should a
draft-level strict gate ever be built (a deliberate decision, since it would
change the facts-only gate's contract). Until then they must not gate the suite.
"""

import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lint_draft import lint


def write_run(
    run_dir: Path, transcript=None, ocr=None, draft=None, coverage=None
) -> Path:
    if transcript is not None:
        (run_dir / "transcript.json").write_text(
            json.dumps(transcript), encoding="utf-8"
        )
    if ocr is not None:
        (run_dir / "ocr.json").write_text(json.dumps(ocr), encoding="utf-8")
    if coverage is not None:
        wf = run_dir / "workflow"
        wf.mkdir(parents=True, exist_ok=True)
        (wf / "coverage_targets.json").write_text(
            json.dumps(coverage), encoding="utf-8"
        )
    draft_path = run_dir / "draft_symbols.json"
    draft_path.write_text(json.dumps(draft or {"symbols": []}), encoding="utf-8")
    return draft_path


_SKIP = (
    "Specifies an unbuilt draft-level strict-coverage gate; the canonical "
    "lint_draft.py is facts-only by design."
)


@unittest.skip(_SKIP)
class StrictCoverageTest(unittest.TestCase):
    def coverage(self):
        return {
            "targets": [
                {
                    "target_id": "cue-000",
                    "start_ms": 0,
                    "source": "transcript-cue",
                    "text": "the red flag represents abducens palsy",
                    "required_terms": ["abducens", "palsy"],
                    "required": True,
                },
                {
                    "target_id": "cue-001",
                    "start_ms": 10000,
                    "source": "transcript-cue",
                    "text": "the blue flag represents trochlear palsy",
                    "required_terms": ["trochlear", "palsy"],
                    "required": True,
                },
            ]
        }

    def draft(
        self,
        *,
        target_ids=None,
        quote="the red flag represents abducens palsy",
        evidence_start_ms=0,
        omissions=None,
    ):
        return {
            "symbols": [
                {
                    "order": 0,
                    "fact": "Abducens palsy causes impaired eye abduction",
                    "symbol_key": "red-flag",
                    "symbol_description": "red flag on the left wall",
                    "meaning": "Red flag represents abducens palsy as the visible warning cue",
                    "evidence": f'Transcript @0:00 "{quote}"',
                    "timestamp_ms": 0,
                    "target_ids": target_ids or ["cue-000"],
                    "evidence_quote": quote,
                    "evidence_start_ms": evidence_start_ms,
                }
            ],
            "omissions": omissions or [],
        }

    def transcript(self):
        return {
            "segments": [
                {"start_ms": 0, "text": "the red flag represents abducens palsy"},
                {"start_ms": 10000, "text": "the blue flag represents trochlear palsy"},
                {"start_ms": 60000, "text": "unrelated text near the cited timestamp"},
            ]
        }

    def test_evidence_must_match_near_cited_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir,
                self.transcript(),
                None,
                self.draft(evidence_start_ms=60000),
                self.coverage(),
            )
            result = lint(run_dir, draft_path)

        self.assertFalse(result["ok"])
        self.assertTrue(
            any(e["code"] == "ungrounded-evidence" for e in result["errors"])
        )

    def test_uncovered_target_fails(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir, self.transcript(), None, self.draft(), self.coverage()
            )
            result = lint(run_dir, draft_path)

        self.assertFalse(result["ok"])
        self.assertTrue(
            any(
                e["code"] == "uncovered-target" and e["target_id"] == "cue-001"
                for e in result["errors"]
            )
        )

    def test_valid_omission_covers_target(self) -> None:
        omissions = [
            {
                "target_id": "cue-001",
                "quote": "the blue flag represents trochlear palsy",
                "reason": "outside-scope",
            }
        ]
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir,
                self.transcript(),
                None,
                self.draft(omissions=omissions),
                self.coverage(),
            )
            result = lint(run_dir, draft_path)

        self.assertTrue(result["ok"])
        self.assertEqual(result["stats"]["coverage_uncovered"], 0)

    def test_invalid_omission_reason_fails(self) -> None:
        omissions = [
            {
                "target_id": "cue-001",
                "quote": "the blue flag represents trochlear palsy",
                "reason": "not important",
            }
        ]
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir,
                self.transcript(),
                None,
                self.draft(omissions=omissions),
                self.coverage(),
            )
            result = lint(run_dir, draft_path)

        self.assertFalse(result["ok"])
        self.assertTrue(any(e["code"] == "invalid-omission" for e in result["errors"]))

    def test_cue_label_fact_fails(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir,
                self.transcript(),
                None,
                self.draft(),
                {"targets": [self.coverage()["targets"][0]]},
            )
            data = json.loads(draft_path.read_text(encoding="utf-8"))
            data["symbols"][0]["fact"] = "title cue"
            draft_path.write_text(json.dumps(data), encoding="utf-8")
            result = lint(run_dir, draft_path)

        self.assertFalse(result["ok"])
        self.assertTrue(any(e["code"] == "weak-fact" for e in result["errors"]))

    def test_full_medical_fact_passes_fact_quality_gate(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir,
                self.transcript(),
                None,
                self.draft(),
                {"targets": [self.coverage()["targets"][0]]},
            )
            result = lint(run_dir, draft_path)

        self.assertTrue(result["ok"])


@unittest.skip(_SKIP)
class HouseStyleQualityTest(unittest.TestCase):
    def transcript(self):
        return {
            "segments": [
                {"start_ms": 0, "text": "By the way, the motion sickness can help you"},
                {
                    "start_ms": 5000,
                    "text": "Damage to the Abducens nerve causes inward deviation toward the midline with horizontal double vision.",
                },
            ]
        }

    def critical_coverage(self):
        return {
            "targets": [
                {
                    "target_id": "critical-000",
                    "start_ms": 5000,
                    "source": "critical-consequence",
                    "text": "Damage to the Abducens nerve causes inward deviation toward the midline with horizontal double vision.",
                    "required_terms": [
                        "damage",
                        "abducens",
                        "deviation",
                        "midline",
                        "horizontal",
                        "double",
                        "vision",
                    ],
                    "critical_terms": [
                        "damage",
                        "deviation",
                        "midline",
                        "horizontal",
                        "diplopia",
                    ],
                    "priority": "high",
                    "required": True,
                }
            ]
        }

    def test_bad_codex_style_fails_quality_lint(self) -> None:
        draft = {
            "symbols": [
                {
                    "order": 0,
                    "fact": "The Abducens nerve is involved in the vestibulo-ocular reflex.",
                    "symbol_key": "motion-sick-guest",
                    "symbol_description": "The dizzy guest with twirling eyes wearing a poncho.",
                    "meaning": "vestibulo-ocular reflex / CN VI ≈ VOR",
                    "evidence": 'Transcript @0:00 "By the way, the motion sickness can help you"',
                    "timestamp_ms": 0,
                    "target_ids": ["critical-000"],
                    "evidence_quote": "By the way, the motion sickness can help you",
                    "evidence_start_ms": 0,
                },
                {
                    "order": 1,
                    "fact": "The pons contains the abducens nucleus.",
                    "symbol_key": "poncho-pons",
                    "symbol_description": "The white poncho on the right side of the scene.",
                    "meaning": "Poncho sounds like pons, the abducens nucleus location cue",
                    "evidence": 'Transcript @0:00 "By the way, the motion sickness can help you"',
                    "timestamp_ms": 0,
                    "target_ids": ["critical-000"],
                    "evidence_quote": "By the way, the motion sickness can help you",
                    "evidence_start_ms": 0,
                },
            ],
            "omissions": [],
        }
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir, self.transcript(), None, draft, self.critical_coverage()
            )
            result = lint(run_dir, draft_path)

        codes = {e["code"] for e in result["errors"]}
        warning_codes = {w["code"] for w in result["warnings"]}
        self.assertIn("weak-meaning", codes)
        self.assertIn("banned-character", codes)
        self.assertIn("bad-evidence-fragment", codes)
        self.assertIn("missing-critical-terms", codes)
        self.assertIn("suspicious-symbol-overlap", warning_codes)

    def test_corrected_reused_symbol_passes_quality_lint(self) -> None:
        quote = "Damage to the Abducens nerve causes inward deviation toward the midline with horizontal double vision."
        draft = {
            "symbols": [
                {
                    "order": 0,
                    "fact": "Abducens nerve innervates the lateral rectus muscle to abduct the eye laterally away from the midline.",
                    "symbol_key": "outward-floodlights",
                    "symbol_description": "Dual floodlights above the center ride, angled outward away from each other.",
                    "meaning": "Outward-facing floodlights encode abduction by pointing the eyes laterally away from the midline.",
                    "evidence": 'Transcript @0:05 "Damage to the Abducens nerve causes inward deviation toward the midline with horizontal double vision."',
                    "timestamp_ms": 5000,
                    "target_ids": ["critical-000"],
                    "evidence_quote": quote,
                    "evidence_start_ms": 5000,
                },
                {
                    "order": 1,
                    "fact": "Damage to Abducens nerve causes ipsilateral inward deviation toward the midline and horizontal diplopia.",
                    "symbol_key": "outward-floodlights",
                    "symbol_description": "Dual floodlights above the center ride, angled outward away from each other.",
                    "meaning": "Failed outward floodlights encode damage causing inward deviation and horizontal diplopia.",
                    "evidence": 'Transcript @0:05 "Damage to the Abducens nerve causes inward deviation toward the midline with horizontal double vision."',
                    "timestamp_ms": 5000,
                    "target_ids": ["critical-000"],
                    "evidence_quote": quote,
                    "evidence_start_ms": 5000,
                },
            ],
            "omissions": [],
        }
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            draft_path = write_run(
                run_dir, self.transcript(), None, draft, self.critical_coverage()
            )
            result = lint(run_dir, draft_path)

        self.assertTrue(result["ok"], result)
        self.assertEqual(result["stats"]["missing_critical_terms"], [])


if __name__ == "__main__":
    unittest.main()
