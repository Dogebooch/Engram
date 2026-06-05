import { describe, expect, it } from "vitest";
import type {
  ImageSymbolLayer,
  RegionSymbolLayer,
} from "@/lib/types/canvas";
import { symbolHasOutline } from "./symbol-outline";

const base = {
  id: "s1",
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
} as const;

function image(): ImageSymbolLayer {
  return { ...base, kind: "image", ref: "openmoji:1F982" };
}

function region(patch: Partial<RegionSymbolLayer>): RegionSymbolLayer {
  return { ...base, kind: "region", ref: null, shape: "rect", ...patch };
}

describe("symbolHasOutline", () => {
  it("is false for undefined (no layer on canvas)", () => {
    expect(symbolHasOutline(undefined)).toBe(false);
  });

  it("is false for image layers", () => {
    expect(symbolHasOutline(image())).toBe(false);
  });

  it("is false for plain-rect regions", () => {
    expect(symbolHasOutline(region({ shape: "rect" }))).toBe(false);
  });

  it("is false for a polygon region with fewer than 3 points", () => {
    expect(
      symbolHasOutline(
        region({ shape: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
      ),
    ).toBe(false);
  });

  it("is true for a polygon region with 3+ points", () => {
    expect(
      symbolHasOutline(
        region({
          shape: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 8 },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("stays true for a polygon region carrying extra outline rings", () => {
    expect(
      symbolHasOutline(
        region({
          shape: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 8 },
          ],
          extraOutlines: [
            {
              x: 20,
              y: 20,
              width: 10,
              height: 10,
              points: [
                { x: 0, y: 0 },
                { x: 6, y: 0 },
                { x: 3, y: 5 },
              ],
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});
