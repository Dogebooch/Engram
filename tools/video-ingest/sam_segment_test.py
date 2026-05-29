import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest_video import scaled_polygon
from sam_segment import bbox_to_xyxy, choose_prompt, mask_to_polygon


def _poly_area(points: list[list[int]]) -> float:
    import cv2

    return float(cv2.contourArea(np.array(points, dtype=np.int32)))


def _hull_area(points: list[list[int]]) -> float:
    import cv2

    hull = cv2.convexHull(np.array(points, dtype=np.int32))
    return float(cv2.contourArea(hull))


class MaskToPolygonTest(unittest.TestCase):
    def test_filled_rect(self) -> None:
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[40:160, 60:140] = 1
        poly = mask_to_polygon(mask)
        self.assertIsNotNone(poly)
        self.assertGreaterEqual(len(poly), 4)
        self.assertLessEqual(len(poly), 24)
        # area roughly the rectangle (120*80 = 9600), allowing morphology slack
        self.assertGreater(_poly_area(poly), 8000)

    def test_concave_l_shape_is_not_a_hull(self) -> None:
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[30:170, 30:80] = 1  # vertical bar
        mask[120:170, 30:170] = 1  # horizontal foot -> L
        poly = mask_to_polygon(mask)
        self.assertIsNotNone(poly)
        # An L is concave: its polygon area is well below its convex hull's.
        self.assertLess(_poly_area(poly), 0.85 * _hull_area(poly))

    def test_detailed_shape_uses_vertex_budget(self) -> None:
        # A 10-point star has ~20 real corners. The search must spend the
        # budget capturing them, not settle near the min_vertices floor (the
        # old binary search broke at the first count above min -> ~9 verts,
        # which is what made large concave symbols coarse).
        import cv2

        cx = cy = 200
        pts = []
        for i in range(20):
            r = 160 if i % 2 == 0 else 70
            ang = np.pi * i / 10
            pts.append([cx + r * np.cos(ang), cy + r * np.sin(ang)])
        mask = np.zeros((400, 400), dtype=np.uint8)
        cv2.fillPoly(mask, [np.array(pts, dtype=np.int32)], 1)
        poly = mask_to_polygon(mask)
        self.assertIsNotNone(poly)
        # Far more than the old ~9-vertex floor, still within the 48 budget.
        self.assertGreaterEqual(len(poly), 16)
        self.assertLessEqual(len(poly), 48)
        # A star is deeply concave — must not collapse to its hull.
        self.assertLess(_poly_area(poly), 0.8 * _hull_area(poly))

    def test_budget_is_capped(self) -> None:
        # Even a wildly detailed contour stays within max_vertices.
        import cv2

        mask = np.zeros((400, 400), dtype=np.uint8)
        pts = []
        for i in range(120):
            r = 160 if i % 2 == 0 else 120
            ang = 2 * np.pi * i / 120
            pts.append([200 + r * np.cos(ang), 200 + r * np.sin(ang)])
        cv2.fillPoly(mask, [np.array(pts, dtype=np.int32)], 1)
        poly = mask_to_polygon(mask, max_vertices=32)
        self.assertIsNotNone(poly)
        self.assertLessEqual(len(poly), 32)

    def test_hole_uses_external_contour(self) -> None:
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[40:160, 40:160] = 1
        mask[80:120, 80:120] = 0  # donut hole
        poly = mask_to_polygon(mask)
        self.assertIsNotNone(poly)
        # External contour ~ the 120x120 outer square, hole ignored.
        self.assertGreater(_poly_area(poly), 13000)

    def test_padding_grows_the_outline(self) -> None:
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[40:160, 60:140] = 1
        tight = _poly_area(mask_to_polygon(mask, pad_px=0))
        padded = _poly_area(mask_to_polygon(mask, pad_px=8))
        self.assertGreater(padded, tight)

    def test_speck_rejected(self) -> None:
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[0:3, 0:3] = 1
        self.assertIsNone(mask_to_polygon(mask))

    def test_empty_rejected(self) -> None:
        self.assertIsNone(mask_to_polygon(np.zeros((50, 50), dtype=np.uint8)))

    def test_output_feeds_scaled_polygon(self) -> None:
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[40:160, 60:140] = 1
        poly = mask_to_polygon(mask)
        layer = scaled_polygon(poly, 1.5, 1.5)
        self.assertEqual(layer["shape"], "polygon")
        self.assertGreaterEqual(len(layer["points"]), 4)
        # points are relative to the layer origin
        self.assertTrue(all(p["x"] >= 0 and p["y"] >= 0 for p in layer["points"]))


class PromptSelectionTest(unittest.TestCase):
    def test_box_when_no_point(self) -> None:
        self.assertEqual(choose_prompt({"bbox": {}}), "box")

    def test_box_point_when_point_present(self) -> None:
        self.assertEqual(
            choose_prompt({"bbox": {}, "point": {"x": 1, "y": 2}}), "box+point"
        )

    def test_explicit_override(self) -> None:
        self.assertEqual(
            choose_prompt({"point": {"x": 1, "y": 2}, "sam_prompt": "point"}), "point"
        )

    def test_bbox_to_xyxy(self) -> None:
        self.assertEqual(
            bbox_to_xyxy({"x": 10, "y": 20, "width": 30, "height": 40}),
            [10, 20, 40, 60],
        )


if __name__ == "__main__":
    unittest.main()
