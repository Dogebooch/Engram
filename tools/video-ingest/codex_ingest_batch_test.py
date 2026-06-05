from __future__ import annotations

import json
import tempfile
import unittest
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import codex_ingest_batch as cib


def sample_video(**overrides):
    data = {
        "id": 12,
        "source": "Pixorize",
        "course": "Biochemistry",
        "title": "Pyruvate",
        "path": r"P:\Medicine Videos\Pixorize\Pyruvate.mp4",
        "slug": "pyruvate",
        "transcriptSegments": 42,
        "dense": False,
        "flagged": False,
    }
    data.update(overrides)
    return data


def sample_job(tmp: Path, **overrides):
    manifest = cib.build_manifest(
        [sample_video(**overrides)],
        tmp,
        prepare=False,
    )
    return manifest["jobs"][0]


class CodexIngestBatchTest(unittest.TestCase):
    def test_batch_manifest_generation_uses_gpt54_for_normal_video(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = cib.build_manifest([sample_video()], root, prepare=False)

        self.assertEqual(manifest["maxConcurrent"], 5)
        self.assertEqual(len(manifest["jobs"]), 1)
        job = manifest["jobs"][0]
        self.assertEqual(job["initialModel"], "gpt-5.4")
        self.assertEqual(job["initialReasoningEffort"], "medium")
        self.assertIn("Write", job["prompt"])
        self.assertIn("draft_symbols.json", job["prompt"])
        self.assertIn("meaning must explain the mnemonic why", job["prompt"])
        self.assertIn("High-priority targets", job["prompt"])
        self.assertIn("Build a target checklist first", job["prompt"])
        self.assertIn('Evidence must be formatted as Transcript @m:ss "clean quote"', job["prompt"])
        self.assertNotIn("≈", job["prompt"])
        self.assertNotIn("→", job["prompt"])

    def test_dense_video_starts_on_gpt54(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            job = sample_job(Path(d), transcriptSegments=300, dense=True)

        self.assertEqual(job["initialModel"], "gpt-5.4")
        self.assertEqual(job["initialReasoningEffort"], "medium")

    def test_pharma_video_starts_on_gpt54(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            job = sample_job(Path(d), course="Pharmacology", title="Levetiracetam")

        self.assertEqual(job["initialModel"], "gpt-5.4")
        self.assertEqual(job["initialReasoningEffort"], "medium")

    def test_explicit_id_resolution_uses_queue_helpers(self) -> None:
        row = {
            "id": 77,
            "source": "Sketchy",
            "course": "Path",
            "title": "Aneurysm",
            "path": r"P:\Videos\Aneurysm.mp4",
        }
        with (
            mock.patch.object(cib.ingest_queue, "connect", return_value=object()),
            mock.patch.object(cib.ingest_queue, "resolve_one", return_value=row),
            mock.patch.object(cib.ingest_queue, "seg_count", return_value=251),
        ):
            videos = cib.resolve_explicit_videos([77])

        self.assertEqual(videos[0]["id"], 77)
        self.assertEqual(videos[0]["slug"], "aneurysm")
        self.assertTrue(videos[0]["dense"])

    def test_lint_error_is_fixable_and_escalates(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root)
            lint = {
                "ok": False,
                "errors": [{"code": "ungrounded-evidence"}],
                "warnings": [],
                "stats": {"symbols": 4, "facts": 4},
            }
            result = cib.classify_job(
                job,
                lint=lint,
                zip_path=root / "pyruvate" / "pyruvate.engram.zip",
                import_check={"ok": False, "issues": []},
                attempts=[{"slug": "pyruvate", "model": "gpt-5.4"}],
            )

        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["needsEscalation"])
        self.assertEqual(result["nextModel"], "gpt-5.5")
        self.assertIn("retryPrompt", result)

    def test_under_extraction_warning_escalates(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root)
            zip_path = root / "pyruvate" / "pyruvate.engram.zip"
            zip_path.parent.mkdir(parents=True)
            zip_path.write_text("placeholder", encoding="utf-8")
            lint = {
                "ok": True,
                "errors": [],
                "warnings": [{"code": "possible-under-extraction"}],
                "stats": {"symbols": 3, "facts": 3, "missing_terms": ["splenic"]},
            }
            result = cib.classify_job(
                job,
                lint=lint,
                zip_path=zip_path,
                import_check={"ok": True, "issues": []},
                attempts=[{"slug": "pyruvate", "model": "gpt-5.4"}],
            )

        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["needsEscalation"])
        self.assertEqual(result["nextModel"], "gpt-5.5")
        self.assertIn("splenic", result["retryPrompt"])
        self.assertIn("under-extraction", result["retryReason"])

    def test_quality_warning_escalates(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root)
            zip_path = root / "pyruvate" / "pyruvate.engram.zip"
            zip_path.parent.mkdir(parents=True)
            zip_path.write_text("placeholder", encoding="utf-8")
            lint = {
                "ok": True,
                "errors": [],
                "warnings": [{"code": "suspicious-symbol-overlap"}],
                "stats": {"symbols": 5, "facts": 5},
            }

            result = cib.classify_job(
                job,
                lint=lint,
                zip_path=zip_path,
                import_check={"ok": True, "issues": []},
                attempts=[{"slug": "pyruvate", "model": "gpt-5.4"}],
            )

        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["needsEscalation"])
        self.assertEqual(result["unresolvedReason"], "quality-warning")
        self.assertIn("suspicious-symbol-overlap", result["retryPrompt"])

    def test_pan_triggers_reauthoring_but_bad_backdrop_does_not(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root)
            zip_path = root / "pyruvate" / "pyruvate.engram.zip"
            zip_path.parent.mkdir(parents=True)
            zip_path.write_text("placeholder", encoding="utf-8")
            lint = {"ok": True, "errors": [], "warnings": [], "stats": {"symbols": 8, "facts": 8}}

            pan = cib.classify_job(
                job,
                lint=lint,
                zip_path=zip_path,
                import_check={"ok": True, "issues": []},
                attempts=[{"slug": "pyruvate", "model": "gpt-5.4", "sceneKind": "pan"}],
            )
            bad_backdrop = cib.classify_job(
                job,
                lint=lint,
                zip_path=zip_path,
                import_check={"ok": True, "issues": []},
                attempts=[
                    {
                        "slug": "pyruvate",
                        "model": "gpt-5.4",
                        "backdropUsable": False,
                    }
                ],
            )

        self.assertEqual(pan["status"], "review")
        self.assertTrue(pan["needsEscalation"])
        self.assertEqual(pan["unresolvedReason"], "pan-coverage")
        self.assertIn("retryPrompt", pan)
        self.assertEqual(bad_backdrop["status"], "review")
        self.assertFalse(bad_backdrop["needsEscalation"])
        self.assertEqual(bad_backdrop["unresolvedReason"], "backdrop-unusable")
        self.assertNotIn("retryPrompt", bad_backdrop)

    def test_verifier_reports_recall_contract_fields_and_retry_reason(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root)
            lint = {
                "ok": False,
                "errors": [
                    {"code": "uncovered-target", "target_id": "cue-002"},
                    {"code": "possible-under-extraction"},
                ],
                "warnings": [],
                "stats": {
                    "symbols": 4,
                    "facts": 4,
                    "ocr_terms": 10,
                    "ocr_coverage": 0.6,
                    "missing_terms": ["phoenix", "phone"],
                    "coverage_targets": 12,
                    "coverage_covered": 9,
                    "coverage_omitted": 1,
                    "coverage_uncovered": 2,
                    "uncovered_targets": ["cue-002", "ocr-004"],
                    "missing_critical_terms": [
                        {"target_id": "critical-000", "missing": ["diplopia"]}
                    ],
                },
            }
            result = cib.classify_job(
                job,
                lint=lint,
                zip_path=root / "pyruvate" / "pyruvate.engram.zip",
                import_check={
                    "ok": False,
                    "issues": [{"code": "missing-zip", "msg": "not built"}],
                },
                attempts=[{"slug": "pyruvate", "model": "gpt-5.4"}],
            )

        self.assertEqual(result["lint"]["errorCodes"], ["uncovered-target", "possible-under-extraction"])
        self.assertEqual(result["coverage"]["targets"], 12)
        self.assertEqual(result["coverage"]["uncovered"], 2)
        self.assertEqual(result["coverage"]["uncoveredTargetIds"], ["cue-002", "ocr-004"])
        self.assertEqual(result["ocr"]["coverage"], 0.6)
        self.assertEqual(result["missingTerms"], ["phoenix", "phone"])
        self.assertFalse(result["importOk"])
        self.assertEqual(result["importIssueCodes"], ["missing-zip"])
        self.assertIn("Coverage target_ids still uncovered", result["retryReason"])
        self.assertIn("critical-000", result["retryReason"])

    def test_verifier_reads_coverage_contract_when_lint_exits_early(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root)
            run_dir = Path(job["runDir"])
            workflow = run_dir / "workflow"
            workflow.mkdir(parents=True)
            (workflow / "coverage_targets.json").write_text(
                json.dumps(
                    {
                        "targets": [
                            {"target_id": "cue-000", "required": True},
                            {"target_id": "ocr-000", "required": True},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            result = cib.classify_job(
                job,
                lint={
                    "ok": False,
                    "errors": [{"code": "no-symbols"}],
                    "warnings": [],
                    "stats": {"symbols": 0},
                },
                zip_path=run_dir / "pyruvate.engram.zip",
                import_check={"ok": False, "issues": [{"code": "missing-zip"}]},
                attempts=[{"slug": "pyruvate", "model": "gpt-5.4"}],
            )

        self.assertEqual(result["coverage"]["targets"], 2)
        self.assertEqual(result["coverage"]["uncovered"], 2)
        self.assertEqual(result["coverage"]["uncoveredTargetIds"], ["cue-000", "ocr-000"])
        self.assertIn("cue-000", result["retryReason"])

    def test_levetiracetam_style_caveat_blocks_strict_pass(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root, title="6. Levetiracetam", course="Pharmacology")
            zip_path = root / "pyruvate" / "pyruvate.engram.zip"
            zip_path.parent.mkdir(parents=True)
            zip_path.write_text("placeholder", encoding="utf-8")
            lint = {"ok": True, "errors": [], "warnings": [], "stats": {"symbols": 2, "facts": 2}}

            result = cib.classify_job(
                job,
                lint=lint,
                zip_path=zip_path,
                import_check={"ok": True, "issues": []},
                attempts=[
                    {
                        "slug": "pyruvate",
                        "workerModel": "gpt-5.5",
                        "caveats": [
                            "Selected backdrop has title overlay; mechanism and side effects were discussed but not symbolized."
                        ],
                    }
                ],
            )

        self.assertEqual(result["status"], "review")
        self.assertFalse(result["needsEscalation"])
        self.assertEqual(result["unresolvedReason"], "caveats")

    def test_finalize_commands_flag_all_codex_rows_and_never_ready(self) -> None:
        ledger = {
            "ledger": [
                {"videoId": 1, "status": "ok", "symbolCount": 6, "needsEscalation": False},
                {
                    "videoId": 2,
                    "status": "review",
                    "unresolvedReason": "pan-coverage",
                    "needsEscalation": False,
                },
                {
                    "videoId": 3,
                    "status": "failed",
                    "unresolvedReason": "lint-errors",
                    "needsEscalation": True,
                },
            ]
        }

        commands = cib.finalize_actions(ledger)
        command_text = [" ".join(command) for command in commands]

        self.assertFalse(any(" ready 1 " in f" {cmd} " for cmd in command_text))
        self.assertTrue(any(" unready 1 " in f" {cmd} " for cmd in command_text))
        self.assertTrue(any(" flag 1 " in f" {cmd} " for cmd in command_text))
        self.assertTrue(any(" flag 2 " in f" {cmd} " for cmd in command_text))
        self.assertTrue(any(" flag 3 " in f" {cmd} " for cmd in command_text))
        self.assertTrue(any("ready-list" in cmd for cmd in command_text))
        self.assertTrue(any("status" in cmd for cmd in command_text))

    def test_finalize_refuses_incomplete_validation_by_default(self) -> None:
        ledger = {
            "ledger": [
                {
                    "videoId": 1,
                    "slug": "pyruvate",
                    "status": "failed",
                    "built": True,
                    "lintOk": False,
                    "importOk": True,
                    "lintErrorCodes": ["possible-under-extraction"],
                    "lintWarningCodes": [],
                    "coverage": {"uncovered": 0},
                    "needsEscalation": True,
                    "unresolvedReason": "lint-errors:possible-under-extraction",
                }
            ]
        }

        result = cib.finalize_ledger(ledger, dry_run=True)

        self.assertFalse(result["ok"])
        self.assertTrue(result["blocked"])
        self.assertIn("queue state was not changed", result["reason"])
        self.assertTrue(result["blockers"])

    def test_finalize_allows_strict_pass_ledger(self) -> None:
        ledger = {
            "ledger": [
                {
                    "videoId": 1,
                    "slug": "pyruvate",
                    "status": "ok",
                    "built": True,
                    "lintOk": True,
                    "importOk": True,
                    "lintErrorCodes": [],
                    "lintWarningCodes": [],
                    "coverage": {"uncovered": 0},
                    "needsEscalation": False,
                    "symbolCount": 6,
                }
            ]
        }

        result = cib.finalize_ledger(ledger, dry_run=True)

        self.assertTrue(result["ok"])
        self.assertTrue(all(r.get("dryRun") for r in result["results"]))

    def test_quarantine_codex_ready_entries_unreadies_and_flags_only_codex_rows(self) -> None:
        ledger = {
            "ready": {
                "1": "codex autopilot ok: 6 symbols",
                "2": "manually vetted",
            },
            "flags": {},
            "skips": {},
        }

        result = cib.quarantine_codex_ready_entries(ledger)
        updated = result["ledger"]

        self.assertEqual(len(result["affected"]), 1)
        self.assertNotIn("1", updated["ready"])
        self.assertIn("2", updated["ready"])
        self.assertIn("1", updated["flags"])
        self.assertIn("human review required", updated["flags"]["1"])


if __name__ == "__main__":
    unittest.main()
