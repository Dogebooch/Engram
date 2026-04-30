import { describe, expect, it } from "vitest";
import { getFactAnchor, meanCenter, symbolCenter } from "./centroid";
import { parseNotes } from "@/lib/notes/parse";
import type { FactHotspots, SymbolLayer } from "@/lib/types/canvas";

function symbol(partial: Partial<SymbolLayer> & { id: string }): SymbolLayer {
  return {
    id: partial.id,
    ref: partial.ref ?? "openmoji:test",
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 100,
    height: partial.height ?? 100,
    rotation: partial.rotation ?? 0,
    layerIndex: partial.layerIndex ?? 0,
    groupId: partial.groupId ?? null,
    animation: null,
    animationDelay: null,
    animationDuration: null,
  };
}

describe("symbolCenter", () => {
  it("returns box-center when rotation is 0", () => {
    const c = symbolCenter(symbol({ id: "a", x: 100, y: 200, width: 80, height: 60 }));
    expect(c.x).toBeCloseTo(140);
    expect(c.y).toBeCloseTo(230);
  });

  it("90deg rotation rotates the local center about (x,y)", () => {
    // local center (50, 50) rotated 90 deg about origin → (-50, 50)
    // then translated to (x, y) = (100, 100) → world (50, 150)
    const c = symbolCenter(
      symbol({ id: "a", x: 100, y: 100, width: 100, height: 100, rotation: 90 }),
    );
    expect(c.x).toBeCloseTo(50);
    expect(c.y).toBeCloseTo(150);
  });

  it("180deg rotation reflects about (x,y)", () => {
    const c = symbolCenter(
      symbol({ id: "a", x: 100, y: 100, width: 60, height: 40, rotation: 180 }),
    );
    expect(c.x).toBeCloseTo(70);
    expect(c.y).toBeCloseTo(80);
  });
});

describe("meanCenter", () => {
  it("returns null on empty input", () => {
    expect(meanCenter([])).toBeNull();
  });

  it("midpoint of two horizontally-spaced symbols", () => {
    const a = symbol({ id: "a", x: 0, y: 0, width: 100, height: 100 });
    const b = symbol({ id: "b", x: 200, y: 0, width: 100, height: 100 });
    const c = meanCenter([a, b]);
    expect(c?.x).toBeCloseTo(150); // mid of (50, 250)
    expect(c?.y).toBeCloseTo(50);
  });
});

describe("getFactAnchor", () => {
  const NOTES = `## Pain
* {sym:11111111-1111-1111-1111-111111111111} pain symbol
* {sym:22222222-2222-2222-2222-222222222222} second
`;

  it("returns user-override coordinates verbatim", () => {
    const parsed = parseNotes(NOTES);
    const factId = parsed.rootFacts[0].factId;
    const hotspots: FactHotspots = {
      [factId]: { x: 999, y: 1234, userOverride: true },
    };
    const symbols = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 0, y: 0 }),
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 800, y: 600 }),
    ];
    expect(getFactAnchor(factId, parsed, symbols, hotspots)).toEqual({
      x: 999,
      y: 1234,
    });
  });

  it("computes centroid for spaced-out multi-symbol facts (no nudge needed)", () => {
    const parsed = parseNotes(NOTES);
    const factId = parsed.rootFacts[0].factId;
    const symbols = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 0, y: 0, width: 100, height: 100 }),
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 200, y: 0, width: 100, height: 100 }),
    ];
    // Centers (50, 50) and (250, 50) → mean (150, 50). Distance from each
    // symbol center is 100, well beyond their 50px radius + 6px breathing room.
    const c = getFactAnchor(factId, parsed, symbols, {});
    expect(c?.x).toBeCloseTo(150);
    expect(c?.y).toBeCloseTo(50);
  });

  it("nudges centroid outside a symbol's bounding circle when it lands inside", () => {
    const SINGLE = `## Loner
* {sym:11111111-1111-1111-1111-111111111111} a
* {sym:22222222-2222-2222-2222-222222222222} b
`;
    const parsed = parseNotes(SINGLE);
    const factId = parsed.rootFacts[0].factId;
    // Two large overlapping symbols → mean lands inside both. Nudge should
    // push the anchor at least `radius + 6` away from each symbol center.
    const symbols = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 0, y: 0, width: 200, height: 200 }),
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 60, y: 0, width: 200, height: 200 }),
    ];
    const c = getFactAnchor(factId, parsed, symbols, {})!;
    // Distance from anchor to each symbol's center must be >= radius (100) + 6
    const dist = (cx: number, cy: number) =>
      Math.hypot(c.x - cx, c.y - cy);
    expect(dist(100, 100)).toBeGreaterThanOrEqual(106 - 0.01);
    expect(dist(160, 100)).toBeGreaterThanOrEqual(106 - 0.01);
  });

  it("single-symbol fact anchors at the upper-right of the symbol, not on top", () => {
    const SINGLE = `## Loner
* {sym:11111111-1111-1111-1111-111111111111} a
`;
    const parsed = parseNotes(SINGLE);
    const factId = parsed.rootFacts[0].factId;
    const symbols = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 100, y: 100, width: 200, height: 200 }),
    ];
    // Center is (200, 200), radius 100. Anchor is offset (+78, -78).
    const c = getFactAnchor(factId, parsed, symbols, {})!;
    expect(c.x).toBeGreaterThan(200); // right of center
    expect(c.y).toBeLessThan(200); // above center
    // and outside the symbol's body (further than radius)
    expect(Math.hypot(c.x - 200, c.y - 200)).toBeGreaterThan(100 - 0.01);
  });

  it("returns null if every linked symbol has been deleted", () => {
    const parsed = parseNotes(NOTES);
    const factId = parsed.rootFacts[0].factId;
    // notes reference two UUIDs; canvas has neither
    const symbols: SymbolLayer[] = [];
    expect(getFactAnchor(factId, parsed, symbols, {})).toBeNull();
  });

  it("non-override entry is ignored (only userOverride wins)", () => {
    // Single-symbol path now applies the upper-right offset, so test that
    // userOverride: false does NOT short-circuit to the override coordinates.
    const parsed = parseNotes(NOTES);
    const factId = parsed.rootFacts[0].factId;
    const hotspots: FactHotspots = {
      [factId]: { x: 999, y: 1234, userOverride: false },
    };
    const symbols = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 0, y: 0, width: 100, height: 100 }),
    ];
    const c = getFactAnchor(factId, parsed, symbols, hotspots);
    // Should NOT be (999, 1234) — that requires userOverride: true.
    expect(c?.x).not.toBeCloseTo(999);
    expect(c?.y).not.toBeCloseTo(1234);
  });

  it("unknown factId returns null", () => {
    const parsed = parseNotes(NOTES);
    expect(getFactAnchor("nonexistent::fact#0", parsed, [], {})).toBeNull();
  });
});

describe("hotspot recompute integration", () => {
  const NOTES_TWO = `## A\n* {sym:11111111-1111-1111-1111-111111111111} a\n* {sym:22222222-2222-2222-2222-222222222222} b\n`;

  it("recomputes anchor when a tagged symbol is moved (no override)", () => {
    const parsed = parseNotes(NOTES_TWO);
    const factId = parsed.rootFacts[0].factId;

    const before = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 0, y: 0, width: 100, height: 100 }),
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 1000, y: 0, width: 100, height: 100 }),
    ];
    const after = [
      before[0],
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 2000, y: 0, width: 100, height: 100 }),
    ];

    const anchorBefore = getFactAnchor(factId, parsed, before, {});
    const anchorAfter = getFactAnchor(factId, parsed, after, {});
    expect(anchorBefore).not.toBeNull();
    expect(anchorAfter).not.toBeNull();
    expect(anchorAfter!.x).toBeGreaterThan(anchorBefore!.x);
  });

  it("override is sticky — moving symbols does not change anchor", () => {
    const parsed = parseNotes(NOTES_TWO);
    const factId = parsed.rootFacts[0].factId;
    const hotspots: FactHotspots = {
      [factId]: { x: 555, y: 777, userOverride: true },
    };
    const before = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 0, y: 0, width: 100, height: 100 }),
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 1000, y: 0, width: 100, height: 100 }),
    ];
    const after = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 5000, y: 5000, width: 100, height: 100 }),
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 9999, y: 9999, width: 100, height: 100 }),
    ];

    const anchorBefore = getFactAnchor(factId, parsed, before, hotspots);
    const anchorAfter = getFactAnchor(factId, parsed, after, hotspots);
    expect(anchorBefore).toEqual({ x: 555, y: 777 });
    expect(anchorAfter).toEqual({ x: 555, y: 777 });
  });

  it("clearing the override resumes recompute", () => {
    const parsed = parseNotes(NOTES_TWO);
    const factId = parsed.rootFacts[0].factId;
    const symbols = [
      symbol({ id: "11111111-1111-1111-1111-111111111111", x: 0, y: 0, width: 100, height: 100 }),
      symbol({ id: "22222222-2222-2222-2222-222222222222", x: 1000, y: 0, width: 100, height: 100 }),
    ];

    const overridden = getFactAnchor(
      factId,
      parsed,
      symbols,
      { [factId]: { x: 1, y: 2, userOverride: true } },
    );
    const cleared = getFactAnchor(factId, parsed, symbols, {});
    expect(overridden).toEqual({ x: 1, y: 2 });
    expect(cleared).not.toBeNull();
    expect(cleared!.x).not.toBe(1);
  });

  it("factHotspots with userOverride: true survive a JSON round-trip", () => {
    const original: FactHotspots = {
      "section::fact#0": { x: 123.456, y: -78.9, userOverride: true },
      "section::other#0": { x: 50, y: 50, userOverride: false },
    };
    const restored: FactHotspots = JSON.parse(JSON.stringify(original));
    expect(restored).toEqual(original);
    expect(restored["section::fact#0"].userOverride).toBe(true);
  });
});
