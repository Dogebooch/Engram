import argparse
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ingest_queue
import pre_extract_pending as pep
from ingest_video import Keyframe, VideoInfo


def kf(index, ms, backdrop=False):
    return Keyframe(
        index=index,
        timestamp_ms=ms,
        frame_number=index * 10,
        image=f"frames/keyframe_{index:03d}.jpg",
        diff_score=0.5,
        context_before=[],
        context_after=[],
        selected_as_backdrop=backdrop,
    )


def make_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE videos (id INTEGER PRIMARY KEY, source TEXT, course TEXT, title TEXT, path TEXT)"
    )
    conn.execute(
        "CREATE TABLE segments (id INTEGER PRIMARY KEY, video_id INTEGER, kind TEXT, "
        "start_seconds REAL, end_seconds REAL, text TEXT)"
    )
    return conn


def add_video(conn, vid, path, title="T", source="Sketchy", course="Biochem"):
    conn.execute(
        "INSERT INTO videos (id, source, course, title, path) VALUES (?,?,?,?,?)",
        (vid, source, course, title, path),
    )


def add_segment(conn, vid, kind, text, start=0.0):
    conn.execute(
        "INSERT INTO segments (video_id, kind, start_seconds, end_seconds, text) VALUES (?,?,?,?,?)",
        (vid, kind, start, start + 1, text),
    )


class IsPreppedTest(unittest.TestCase):
    def test_requires_all_jsons_and_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp)
            self.assertFalse(pep.is_prepped(run))
            for name in (
                "video_info.json",
                "keyframes.json",
                "transcript.json",
                "ocr.json",
            ):
                (run / name).write_text("{}", encoding="utf-8")
            # All jsons present but no frames dir yet.
            self.assertFalse(pep.is_prepped(run))
            frames = run / "frames"
            frames.mkdir()
            self.assertFalse(pep.is_prepped(run))  # empty frames dir
            (frames / "keyframe_000.jpg").write_text("x", encoding="utf-8")
            self.assertTrue(pep.is_prepped(run))

    def test_empty_json_is_not_prepped(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp)
            for name in ("video_info.json", "transcript.json", "ocr.json"):
                (run / name).write_text("{}", encoding="utf-8")
            (run / "keyframes.json").write_text("", encoding="utf-8")  # empty
            (run / "frames").mkdir()
            (run / "frames" / "k.jpg").write_text("x", encoding="utf-8")
            self.assertFalse(pep.is_prepped(run))


class KeyframeSummaryTest(unittest.TestCase):
    def test_picks_backdrop_and_compacts(self):
        frames = [
            {
                "index": 0,
                "timestamp_ms": 0,
                "image": "a.jpg",
                "selected_as_backdrop": False,
            },
            {
                "index": 1,
                "timestamp_ms": 50,
                "image": "b.jpg",
                "selected_as_backdrop": True,
            },
        ]
        count, backdrop, compact = pep.keyframe_summary(frames)
        self.assertEqual(count, 2)
        self.assertEqual(backdrop, 1)
        self.assertEqual(json.loads(compact)[1]["image"], "b.jpg")

    def test_no_backdrop_is_none(self):
        _, backdrop, _ = pep.keyframe_summary(
            [{"index": 0, "timestamp_ms": 0, "image": "a.jpg"}]
        )
        self.assertIsNone(backdrop)


def base_job(out_dir, vid=1, path="P:/Medicine Videos/foo.mp4"):
    return {
        "id": vid,
        "source": "Sketchy",
        "course": "Biochem",
        "title": "Foo",
        "path": path,
        "slug": "foo",
        "out_dir": str(out_dir),
        "transcript": [{"start_ms": 0, "end_ms": 1000, "text": "a pirate is pyruvate"}],
        "ocr": [{"start_ms": 0, "text": "Pyruvate"}],
    }


class ProcessVideoTest(unittest.TestCase):
    def test_reused_when_already_prepped(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "foo"
            out.mkdir()
            for name in ("video_info.json", "transcript.json", "ocr.json"):
                (out / name).write_text("{}", encoding="utf-8")
            (out / "keyframes.json").write_text(
                json.dumps(
                    [
                        {
                            "index": 0,
                            "timestamp_ms": 0,
                            "image": "a.jpg",
                            "selected_as_backdrop": True,
                        }
                    ]
                ),
                encoding="utf-8",
            )
            (out / "frames").mkdir()
            (out / "frames" / "k.jpg").write_text("x", encoding="utf-8")
            row = pep.process_video(base_job(out), force=False, now="now")
            self.assertEqual(row["outcome"], "reused")
            self.assertEqual(row["frames_ready"], 1)
            self.assertEqual(row["backdrop_index"], 0)

    def test_failed_when_video_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "foo"
            row = pep.process_video(
                base_job(out, path=str(Path(tmp) / "nope.mp4")), force=False, now="now"
            )
            self.assertEqual(row["outcome"], "failed")
            self.assertEqual(row["frames_ready"], 0)
            self.assertIn("missing", row["error"])

    def test_extracted_writes_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "foo"
            video = Path(tmp) / "foo.mp4"
            video.write_text("x", encoding="utf-8")  # just needs to exist
            info = VideoInfo(
                path=str(video),
                title="foo",
                fps=30,
                frames=900,
                duration_ms=30000,
                width=1920,
                height=1080,
            )
            with (
                mock.patch.object(pep, "read_video_info", return_value=info),
                mock.patch.object(
                    pep,
                    "extract_keyframes",
                    return_value=[kf(0, 0), kf(1, 100, backdrop=True), kf(2, 200)],
                ) as ek,
            ):
                row = pep.process_video(
                    base_job(out, path=str(video)), force=False, now="now"
                )
            self.assertEqual(row["outcome"], "extracted")
            self.assertEqual(ek.call_count, 1)  # 3 keyframes -> no spread re-extract
            self.assertEqual(row["keyframe_count"], 3)
            self.assertEqual(row["backdrop_index"], 1)
            # All four run-dir artifacts written, transcript shape mirrors mvs_transcript.
            t = json.loads((out / "transcript.json").read_text(encoding="utf-8"))
            self.assertEqual(t["model"], "mvs-index")
            self.assertEqual(t["segments"][0]["text"], "a pirate is pyruvate")
            o = json.loads((out / "ocr.json").read_text(encoding="utf-8"))
            self.assertEqual(o["segments"][0]["text"], "Pyruvate")
            self.assertTrue((out / "video_info.json").exists())
            self.assertTrue((out / "keyframes.json").exists())

    def test_static_scene_triggers_spread_reextract(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "foo"
            video = Path(tmp) / "foo.mp4"
            video.write_text("x", encoding="utf-8")
            info = VideoInfo(
                path=str(video),
                title="foo",
                fps=30,
                frames=900,
                duration_ms=30000,
                width=1920,
                height=1080,
            )
            # First pass yields 1 keyframe (static); spread pass yields a real spread.
            with (
                mock.patch.object(pep, "read_video_info", return_value=info),
                mock.patch.object(
                    pep,
                    "extract_keyframes",
                    side_effect=[
                        [kf(0, 0, backdrop=True)],
                        [kf(i, i * 100, backdrop=(i == 2)) for i in range(5)],
                    ],
                ) as ek,
            ):
                row = pep.process_video(
                    base_job(out, path=str(video)), force=False, now="now"
                )
            self.assertEqual(ek.call_count, 2)  # spread fallback fired
            self.assertEqual(row["keyframe_count"], 5)
            self.assertEqual(row["backdrop_index"], 2)


class SelectVideosTest(unittest.TestCase):
    def test_stem_based_slug_and_pending_filter(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn = make_db()
            add_video(
                conn, 1, "P:/Medicine Videos/Sketchy/Thiamine B1.mp4", title="Thiamine"
            )
            add_segment(conn, 1, "transcript", "thiamine pyrophosphate")
            add_segment(conn, 1, "ocr", "Thiamine")
            args = argparse.Namespace(
                out_root=Path(tmp),
                count=5,
                source=None,
                course=None,
                video_ids=None,
                all=False,
            )
            with mock.patch.object(
                ingest_queue,
                "load_ledger",
                return_value={"skips": {}, "flags": {}, "ready": {}},
            ):
                jobs = pep.select_videos(conn, args)
            self.assertEqual(len(jobs), 1)
            job = jobs[0]
            self.assertEqual(job["slug"], "thiamine-b1")  # stem-based, not title-based
            self.assertEqual(job["out_dir"], str(Path(tmp) / "thiamine-b1"))
            self.assertEqual(job["transcript"][0]["text"], "thiamine pyrophosphate")
            self.assertEqual(job["ocr"][0]["text"], "Thiamine")

    def test_video_ids_override_selection(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn = make_db()
            add_video(conn, 7, "P:/x/bar.mp4")
            add_video(conn, 8, "P:/x/baz.mp4")
            args = argparse.Namespace(
                out_root=Path(tmp),
                count=5,
                source=None,
                course=None,
                video_ids=[8],
                all=False,
            )
            jobs = pep.select_videos(conn, args)
            self.assertEqual([j["id"] for j in jobs], [8])
            self.assertEqual(jobs[0]["slug"], "baz")


class ExtractionDbTest(unittest.TestCase):
    def _row(self, **over):
        row = {
            "video_id": 1,
            "slug": "foo",
            "run_dir": "P:/runs/foo",
            "status": "ok",
            "frames_ready": 1,
            "keyframe_count": 4,
            "backdrop_index": 2,
            "transcript_segments": 10,
            "ocr_segments": 3,
            "keyframes_json": "[]",
            "error": None,
            "extracted_at": "now",
        }
        row.update(over)
        return row

    def test_upsert_then_extraction_status(self):
        conn = make_db()
        conn.execute(pep.EXTRACTION_DDL)
        # Before any row -> framesReady is False but does not raise.
        self.assertIsNone(ingest_queue.extraction_status(conn, 1))
        pep.upsert_row(conn, self._row())
        got = ingest_queue.extraction_status(conn, 1)
        assert got is not None
        self.assertEqual(got["frames_ready"], 1)
        self.assertEqual(got["run_dir"], "P:/runs/foo")
        # Upsert is idempotent: a second write updates in place.
        pep.upsert_row(conn, self._row(frames_ready=0, status="failed"))
        again = ingest_queue.extraction_status(conn, 1)
        assert again is not None
        self.assertEqual(again["frames_ready"], 0)
        self.assertEqual(again["status"], "failed")
        count = conn.execute("SELECT COUNT(*) FROM engram_extraction").fetchone()[0]
        self.assertEqual(count, 1)

    def test_extraction_status_no_table_returns_none(self):
        conn = make_db()  # no engram_extraction table
        self.assertIsNone(ingest_queue.extraction_status(conn, 1))


if __name__ == "__main__":
    unittest.main()
