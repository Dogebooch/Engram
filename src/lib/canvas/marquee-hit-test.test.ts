import { describe, expect, it } from "vitest";
import {
  marqueeHitTest,
  normalizeRect,
  rectsIntersect,
  symbolAabb,
} from "./marquee-hit-test";
import type { SymbolLayer } from "@/lib/types/canvas";

function makeLayer(over: Partial<SymbolLayer>): SymbolLayer {
  return {
    id: "id",
    ref: "ref",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    layerIndex: 0,
    groupId: null,
    animation: null,
    animationDelay: null,
    animationDuration: null,
    ...over,
  };
}

describe("normalizeRect", () => {
  it("normalizes a backwards drag (up-left)", () => {
    expect(normalizeRect(100, 100, 50, 30)).toEqual({
      x: 50,
      y: 30,
      width: 50,
      height: 70,
    });
  });
  it("zero-area rect", () => {
    expect(normalizeRect(10, 10, 10, 10)).toEqual({
      x: 10,
      y: 10,
      width: 0,
      height: 0,
    });
  });
});

describe("symbolAabb", () => {
  it("matches xywh for unrotated symbol", () => {
    const layer = makeLayer({ x: 50, y: 80, width: 100, height: 60 });
    expect(symbolAabb(layer)).toEqual({
      x: 50,
      y: 80,
      width: 100,
      height: 60,
    });
  });
  it("expands AABB for a 45° rotation", () => {
    // 100×100 square rotated 45° → diagonal 100√2 ≈ 141.42 wide & tall.
    const layer = makeLayer({ x: 0, y: 0, width: 100, height: 100, rotation: 45 });
    const aabb = symbolAabb(layer);
    expect(aabb.width).toBeCloseTo(Math.SQRT2 * 100, 5);
    expect(aabb.height).toBeCloseTo(Math.SQRT2 * 100, 5);
  });
});

describe("rectsIntersect", () => {
  it("disjoint", () => {
    expect(
      rectsIntersect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 10, height: 10 },
      ),
    ).toBe(false);
  });
  it("partial overlap", () => {
    expect(
      rectsIntersect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      ),
    ).toBe(true);
  });
  it("touching edges does not count", () => {
    expect(
      rectsIntersect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
      ),
    ).toBe(false);
  });
  it("zero-area marquee never intersects", () => {
    expect(
      rectsIntersect(
        { x: 5, y: 5, width: 0, height: 0 },
        { x: 0, y: 0, width: 100, height: 100 },
      ),
    ).toBe(false);
  });
});

describe("marqueeHitTest", () => {
  const a = makeLayer({ id: "a", x: 0, y: 0, width: 50, height: 50 });
  const b = makeLayer({ id: "b", x: 100, y: 0, width: 50, height: 50 });
  const c = makeLayer({ id: "c", x: 200, y: 200, width: 50, height: 50 });

  it("selects fully-enclosed symbols", () => {
    const hits = marqueeHitTest(
      { x: -10, y: -10, width: 70, height: 70 },
      [a, b, c],
    );
    expect(hits).toEqual(["a"]);
  });
  it("skips fully-outside symbols", () => {
    const hits = marqueeHitTest(
      { x: 500, y: 500, width: 50, height: 50 },
      [a, b, c],
    );
    expect(hits).toEqual([]);
  });
  it("selects partial-overlap symbols (touch-to-select)", () => {
    // Marquee covers right edge of a and left edge of b.
    const hits = marqueeHitTest(
      { x: 30, y: 10, width: 90, height: 30 },
      [a, b, c],
    );
    expect(hits).toEqual(["a", "b"]);
  });
  it("rotation-aware: marquee that touches rotated AABB but misses unrotated rect", () => {
    // 100×20 rectangle at (200, 200), rotated 90° about (200, 200) →
    // rotated corners span x∈[180, 200], y∈[200, 300] (20×100 envelope).
    // Marquee at (185..195, 280..295) overlaps the rotated AABB but lies
    // entirely outside the unrotated (200..300, 200..220) rect.
    const wide = makeLayer({
      id: "wide",
      x: 200,
      y: 200,
      width: 100,
      height: 20,
      rotation: 90,
    });
    const hits = marqueeHitTest(
      { x: 185, y: 280, width: 10, height: 15 },
      [wide],
    );
    expect(hits).toEqual(["wide"]);
  });
  it("zero-area marquee returns []", () => {
    expect(marqueeHitTest({ x: 0, y: 0, width: 0, height: 0 }, [a])).toEqual(
      [],
    );
  });
  it("empty layers list returns []", () => {
    expect(
      marqueeHitTest({ x: 0, y: 0, width: 100, height: 100 }, []),
    ).toEqual([]);
  });
  it("preserves input ordering of layers in output", () => {
    const hits = marqueeHitTest(
      { x: -10, y: -10, width: 500, height: 500 },
      [c, b, a],
    );
    expect(hits).toEqual(["c", "b", "a"]);
  });
});
