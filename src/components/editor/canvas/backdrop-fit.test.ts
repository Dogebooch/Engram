import { describe, expect, it } from "vitest";
import { coverFit } from "./backdrop-fit";

describe("coverFit", () => {
  it("matches exact 1920x1080 image (no overflow)", () => {
    const r = coverFit(1920, 1080);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
  });

  it("portrait image fills width, overflows top/bottom equally", () => {
    // 1080x1920 → scale = max(1920/1080, 1080/1920) = 1.7777...
    const r = coverFit(1080, 1920);
    const scale = 1920 / 1080;
    expect(r.width).toBeCloseTo(1080 * scale);
    expect(r.height).toBeCloseTo(1920 * scale);
    // Width fills exactly; height overflows symmetrically.
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeLessThan(0);
    expect(r.y).toBeCloseTo((1080 - 1920 * scale) / 2);
  });

  it("ultra-wide image fills height, overflows sides equally", () => {
    // 4000x1000 → scale = max(1920/4000, 1080/1000) = 1.08
    const r = coverFit(4000, 1000);
    const scale = 1080 / 1000;
    expect(r.height).toBeCloseTo(1000 * scale);
    expect(r.width).toBeCloseTo(4000 * scale);
    expect(r.y).toBeCloseTo(0);
    expect(r.x).toBeCloseTo((1920 - 4000 * scale) / 2);
  });

  it("square image fills the larger axis", () => {
    const r = coverFit(800, 800);
    const scale = 1920 / 800; // wider stage drives the fit
    expect(r.width).toBeCloseTo(800 * scale);
    expect(r.height).toBeCloseTo(800 * scale);
    // height overflows symmetrically
    expect(r.y).toBeCloseTo((1080 - 800 * scale) / 2);
    expect(r.x).toBeCloseTo(0);
  });

  it("returns full stage when image dimensions are zero or negative", () => {
    const r = coverFit(0, 0);
    expect(r).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("respects custom stage dimensions", () => {
    const r = coverFit(100, 100, 200, 100);
    // scale = max(200/100, 100/100) = 2 → 200x200, centered.
    expect(r.width).toBe(200);
    expect(r.height).toBe(200);
    expect(r.x).toBe(0);
    expect(r.y).toBe(-50);
  });
});
