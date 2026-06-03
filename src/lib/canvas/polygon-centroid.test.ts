import { describe, expect, it } from "vitest";
import { polygonBBox, polygonCentroid } from "./polygon-centroid";

describe("polygonCentroid", () => {
  it("returns origin for empty input", () => {
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
  });

  it("returns the point itself for single-vertex input", () => {
    expect(polygonCentroid([{ x: 5, y: -3 }])).toEqual({ x: 5, y: -3 });
  });

  it("returns midpoint for two-vertex input", () => {
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 4 }])).toEqual({
      x: 5,
      y: 2,
    });
  });

  it("computes the centroid of a unit square", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const c = polygonCentroid(sq);
    expect(c.x).toBeCloseTo(0.5, 6);
    expect(c.y).toBeCloseTo(0.5, 6);
  });

  it("handles a non-convex L-shape (signed-area, not vertex mean)", () => {
    // L-shape: 6×6 square with the upper-right 3×3 quadrant removed.
    //
    //   (0,6)  (3,6)
    //     +-----+
    //     |     |
    //     |     +--+ (6,3)
    //     |        |
    //     +--------+
    //   (0,0)    (6,0)
    //
    // True centroid via area decomposition (bottom 6×3 rect + left 3×3 rect):
    //   total area = 18 + 9 = 27
    //   Cx = (18·3 + 9·1.5) / 27 = 67.5 / 27 = 2.5
    //   Cy = (18·1.5 + 9·4.5) / 27 = 67.5 / 27 = 2.5
    // Naive vertex mean would give (3, 3), which sits in the cut-out
    // upper-right quadrant — catching this is the whole point of using
    // the signed-area formula instead.
    const L = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 6 },
      { x: 0, y: 6 },
    ];
    const c = polygonCentroid(L);
    expect(c.x).toBeCloseTo(2.5, 6);
    expect(c.y).toBeCloseTo(2.5, 6);
  });

  it("computes the centroid of a right triangle", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 9 },
    ];
    const c = polygonCentroid(tri);
    expect(c.x).toBeCloseTo(2, 6);
    expect(c.y).toBeCloseTo(3, 6);
  });

  it("falls back to bbox center when polygon is degenerate (collinear)", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
    ];
    const c = polygonCentroid(line);
    // bbox is x:0..8, y:0..0 → center (4, 0)
    expect(c.x).toBeCloseTo(4, 6);
    expect(c.y).toBeCloseTo(0, 6);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
  });
});

describe("polygonBBox", () => {
  it("returns zero box for empty input", () => {
    expect(polygonBBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("encloses a scattered point set", () => {
    const pts = [
      { x: -2, y: 5 },
      { x: 7, y: 1 },
      { x: 3, y: -4 },
      { x: 0, y: 9 },
    ];
    const b = polygonBBox(pts);
    expect(b).toEqual({ x: -2, y: -4, width: 9, height: 13 });
  });
});
