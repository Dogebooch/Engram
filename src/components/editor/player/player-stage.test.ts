import { describe, expect, it } from "vitest";
import { spreadOverlappingHotspots, type PlayerHotspot } from "./player-stage";

function hotspot(id: string, ordinal: number, x = 100, y = 100): PlayerHotspot {
  return { factId: id, ordinal, x, y };
}

describe("spreadOverlappingHotspots", () => {
  it("keeps distinct hotspots unchanged", () => {
    const input = [hotspot("a", 1), hotspot("b", 2, 300, 300)];

    expect(spreadOverlappingHotspots(input)).toEqual(input);
  });

  it("separates duplicate anchors so reused symbols remain clickable", () => {
    const [a, b] = spreadOverlappingHotspots([
      hotspot("a", 1),
      hotspot("b", 2),
    ]);

    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeGreaterThan(100);
    expect(a.y).toBeLessThan(100);
    expect(b.y).toBeLessThan(100);
  });

  it("clamps generated anchors into the visible stage", () => {
    const [a] = spreadOverlappingHotspots([hotspot("a", 1, 3000, -100)]);

    expect(a.x).toBe(1896);
    expect(a.y).toBe(24);
  });
});
