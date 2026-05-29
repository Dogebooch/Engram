import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest_video import is_placeable_symbol


class VideoIngestQaTest(unittest.TestCase):
    def test_rejects_whole_frame_boxes(self) -> None:
        symbol = {"bbox": {"x": 0, "y": 0, "width": 1280, "height": 720}}

        self.assertFalse(is_placeable_symbol(symbol, 1280, 720))


if __name__ == "__main__":
    unittest.main()
