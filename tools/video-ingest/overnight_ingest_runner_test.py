from __future__ import annotations

import argparse
import datetime as dt
import tempfile
import unittest
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import overnight_ingest_runner as runner


def sample_job(tmp: Path) -> dict:
    run_dir = tmp / "pyruvate"
    return {
        "videoId": 12,
        "slug": "pyruvate",
        "title": "Pyruvate",
        "runDir": str(run_dir),
        "initialModel": "gpt-5.4",
        "initialReasoningEffort": "medium",
    }


class OvernightIngestRunnerTest(unittest.TestCase):
    def test_parse_final_json_accepts_plain_and_fenced_json(self) -> None:
        self.assertEqual(runner.parse_final_json('{"slug":"x","built":true}')["slug"], "x")
        fenced = '```json\n{"slug":"x","built":false}\n```'
        self.assertFalse(runner.parse_final_json(fenced)["built"])

    def test_dry_run_worker_writes_prompt_and_returns_command(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            job = sample_job(root)
            result = runner.run_worker(
                state_dir=root / "state",
                job=job,
                prompt="Write draft_symbols.json.",
                attempt_no=1,
                codex_bin="codex",
                sandbox="danger-full-access",
                extra_args=[],
                timeout_minutes=1,
                dry_run=True,
            )

            self.assertEqual(result["status"], "planned")
            self.assertIn("codex", result["command"][0])
            self.assertIn("--skip-git-repo-check", result["command"])
            self.assertIn("-m", result["command"])
            self.assertIn("gpt-5.4", result["command"])
            self.assertIn('model_reasoning_effort="medium"', result["command"])
            self.assertIn("--output-schema", result["command"])
            self.assertEqual(result["workerModel"], "gpt-5.4")
            self.assertEqual(result["workerReasoningEffort"], "medium")
            prompt = Path(result["promptPath"]).read_text(encoding="utf-8")
            self.assertIn("OVERNIGHT RUN SAFETY", prompt)
            self.assertIn("Write draft_symbols.json.", prompt)

    def test_update_state_from_ledger_tracks_ok_review_and_failed(self) -> None:
        state = {"completedVideoIds": [], "reviewVideoIds": [], "failedVideoIds": []}
        ledger = {
            "ledger": [
                {"videoId": 1, "status": "ok"},
                {"videoId": 2, "status": "review"},
                {"videoId": 3, "status": "failed", "needsEscalation": False},
                {"videoId": 4, "status": "failed", "needsEscalation": True},
            ]
        }

        runner.update_state_from_ledger(state, ledger)

        self.assertEqual(state["completedVideoIds"], [1])
        self.assertEqual(state["reviewVideoIds"], [2])
        self.assertEqual(state["failedVideoIds"], [3])

    def test_deadline_uses_explicit_stop_at(self) -> None:
        args = argparse.Namespace(stop_at="2026-06-04T07:00:00-05:00", max_run_hours=8)
        deadline = runner.make_deadline(args)

        self.assertEqual(deadline.tzinfo, dt.UTC)
        self.assertEqual(deadline.hour, 12)

    def test_explicit_videos_filters_already_seen_ids(self) -> None:
        videos = [
            {"id": 223, "slug": "abducens"},
            {"id": 224, "slug": "anterior"},
        ]
        with mock.patch.object(runner.batch, "resolve_explicit_videos", return_value=videos) as resolve:
            selected, pulled = runner.explicit_videos([223, 224], already_seen={223}, count=2)

        resolve.assert_called_once_with([223, 224])
        self.assertEqual([v["id"] for v in selected], [224])
        self.assertEqual(pulled["mode"], "explicit")
        self.assertEqual(pulled["ids"], [223, 224])


if __name__ == "__main__":
    unittest.main()
