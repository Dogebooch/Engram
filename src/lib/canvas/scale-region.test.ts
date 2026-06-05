import { describe, expect, it } from "vitest";
import { scaleRing } from "./scale-region";

describe("scaleRing", () => {
  const ring = {
    x: 30,
    y: 40,
    width: 20,
    height: 10,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 10, y: 10 },
    ],
  };

  it("scales offset, dimensions, and points by (sx, sy)", () => {
    expect(scaleRing(ring, 2, 3)).toEqual({
      x: 60,
      y: 120,
      width: 40,
      height: 30,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 20, y: 30 },
      ],
    });
  });

  it("is identity at scale 1", () => {
    expect(scaleRing(ring, 1, 1)).toEqual(ring);
  });

  it("clamps width/height to a minimum of 8", () => {
    const out = scaleRing(ring, 0.1, 0.1);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    // Offsets and points still scale freely.
    expect(out.x).toBeCloseTo(3);
    expect(out.y).toBeCloseTo(4);
  });
});
