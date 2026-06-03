import { describe, expect, it } from "vitest";
import {
  finalizeLassoPolygon,
  simplifyPolyline,
} from "./simplify-polygon";

describe("simplifyPolyline", () => {
  it("returns input unchanged when fewer than 3 points", () => {
    expect(simplifyPolyline([])).toEqual([]);
    expect(simplifyPolyline([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
    expect(
      simplifyPolyline([{ x: 0, y: 0 }, { x: 5, y: 5 }]),
    ).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  });

  it("collapses collinear interior points", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 10, y: 0 },
    ];
    const out = simplifyPolyline(line, 0.5);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("preserves a vertex that exceeds epsilon", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 5, y: 4 }, // peak — should stay
      { x: 10, y: 0 },
    ];
    const out = simplifyPolyline(tri, 1);
    expect(out).toEqual(tri);
  });

  it("smooths a noisy near-straight run within epsilon", () => {
    // Tiny jitters of <1px around y=0 — RDP with eps=1 should drop them.
    const noisy = [
      { x: 0, y: 0 },
      { x: 1, y: 0.3 },
      { x: 2, y: -0.4 },
      { x: 3, y: 0.2 },
      { x: 4, y: -0.1 },
      { x: 5, y: 0 },
    ];
    const out = simplifyPolyline(noisy, 1);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 5, y: 0 });
  });
});

describe("finalizeLassoPolygon", () => {
  it("rejects empty input", () => {
    const r = finalizeLassoPolygon([]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too-few-vertices");
  });

  it("rejects fewer than 3 vertices after simplification", () => {
    const r = finalizeLassoPolygon([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too-few-vertices");
  });

  it("rejects collinear traces (collapse to two points)", () => {
    const r = finalizeLassoPolygon([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 12, y: 0 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too-few-vertices");
  });

  it("rejects polygons with bbox area below the floor", () => {
    // 5×5 square = 25 px², below the 100 px² floor.
    const r = finalizeLassoPolygon([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too-small");
  });

  it("accepts a clean square trace", () => {
    const r = finalizeLassoPolygon([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.polygon).toBeDefined();
    expect(r.polygon!.length).toBe(4);
  });

  it("strips a closing point that coincides with the start", () => {
    const r = finalizeLassoPolygon([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 0, y: 0 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.polygon!.length).toBe(4);
  });
});
