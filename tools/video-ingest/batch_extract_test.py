import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from batch_extract import discover_videos, is_extracted


class DiscoverVideosTest(unittest.TestCase):
    def test_filters_by_extension_recursively(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "sub").mkdir()
            (root / "a.mp4").write_bytes(b"")
            (root / "sub" / "b.mkv").write_bytes(b"")
            (root / "notes.srt").write_bytes(b"")
            (root / "thumb.jpg").write_bytes(b"")
            found = [p.name for p in discover_videos(root)]
            self.assertEqual(found, ["a.mp4", "b.mkv"])


class IsExtractedTest(unittest.TestCase):
    def _make(self, d: Path, names: list[str], empty: list[str] | None = None) -> None:
        for name in names:
            (d / name).write_text("{}", encoding="utf-8")
        for name in empty or []:
            (d / name).write_text("", encoding="utf-8")

    def test_all_present_non_empty(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            self._make(out, ["video_info.json", "keyframes.json", "transcript.json"])
            self.assertTrue(is_extracted(out))

    def test_missing_one_is_false(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            self._make(out, ["video_info.json", "keyframes.json"])
            self.assertFalse(is_extracted(out))

    def test_empty_file_is_false(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            self._make(
                out, ["video_info.json", "keyframes.json"], empty=["transcript.json"]
            )
            self.assertFalse(is_extracted(out))


if __name__ == "__main__":
    unittest.main()
