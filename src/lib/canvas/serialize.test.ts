import { describe, expect, it } from "vitest";
import { CANVAS_SCHEMA_VERSION } from "@/lib/constants";
import { emptyCanvas, type CanvasState, type SymbolLayer } from "@/lib/types/canvas";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeSymbol(id: string, overrides: Partial<SymbolLayer> = {}): SymbolLayer {
  return {
    id,
    ref: "openmoji:1F600",
    x: 100,
    y: 200,
    width: 300,
    height: 250,
    rotation: 0,
    layerIndex: 0,
    groupId: null,
    animation: null,
    animationDelay: null,
    animationDuration: null,
    ...overrides,
  };
}

describe("canvas state serialization", () => {
  it("round-trips an empty canvas through JSON", () => {
    const original = emptyCanvas();
    const restored = clone(original);
    expect(restored).toEqual(original);
    expect(restored.schemaVersion).toBe(CANVAS_SCHEMA_VERSION);
    expect(restored.symbols).toEqual([]);
    expect(restored.groups).toEqual([]);
    expect(restored.factHotspots).toEqual({});
  });

  it("round-trips a fully-populated canvas including override + non-override hotspots", () => {
    const original: CanvasState = {
      schemaVersion: 1,
      backdrop: { ref: "openmoji:beach", uploadedBlobId: null, opacity: 1 },
      symbols: [
        makeSymbol("11111111-1111-4111-8111-111111111111"),
        makeSymbol("22222222-2222-4222-8222-222222222222", {
          rotation: 45,
          groupId: "g0000000-0000-4000-8000-000000000000",
        }),
        makeSymbol("33333333-3333-4333-8333-333333333333", {
          x: 999,
          y: 888,
          width: 100,
          height: 100,
        }),
      ],
      groups: [
        {
          id: "g0000000-0000-4000-8000-000000000000",
          name: "Cluster",
          symbolIds: ["22222222-2222-4222-8222-222222222222"],
        },
      ],
      factHotspots: {
        "section::a#0": { x: 500, y: 300, userOverride: true },
        "section::b#0": { x: 600, y: 400, userOverride: false },
      },
      factMeta: {},
      timeline: [],
    };
    const restored = clone(original);
    expect(restored).toEqual(original);
  });

  it("preserves the schema version through round-trip", () => {
    const c = emptyCanvas();
    const restored = clone(c);
    expect(restored.schemaVersion).toBe(c.schemaVersion);
    expect(restored.schemaVersion).toBe(CANVAS_SCHEMA_VERSION);
  });

  it("preserves user-override hotspots verbatim (x, y, userOverride flag)", () => {
    const c: CanvasState = {
      ...emptyCanvas(),
      factHotspots: {
        "f::override#0": { x: 1.234, y: -5.678, userOverride: true },
      },
    };
    const restored = clone(c);
    expect(restored.factHotspots["f::override#0"]).toEqual({
      x: 1.234,
      y: -5.678,
      userOverride: true,
    });
  });

  it("preserves animation slot nulls (architectural fields for v2)", () => {
    const c: CanvasState = {
      ...emptyCanvas(),
      symbols: [makeSymbol("11111111-1111-4111-8111-111111111111")],
    };
    const restored = clone(c);
    const sy = restored.symbols[0];
    expect(sy.animation).toBeNull();
    expect(sy.animationDelay).toBeNull();
    expect(sy.animationDuration).toBeNull();
  });

  it("preserves unknown forward-compat fields through JSON.parse(JSON.stringify(...))", () => {
    // Simulate a v2-style field that lands on the symbol shape later.
    const original = {
      ...emptyCanvas(),
      symbols: [
        {
          ...makeSymbol("11111111-1111-4111-8111-111111111111"),
          futureField: { something: "v2" },
        },
      ],
    };
    const restored = JSON.parse(JSON.stringify(original));
    expect(restored.symbols[0].futureField).toEqual({ something: "v2" });
  });

  it("preserves group membership ordering", () => {
    const c: CanvasState = {
      ...emptyCanvas(),
      groups: [
        {
          id: "g0000000-0000-4000-8000-000000000000",
          name: null,
          symbolIds: ["a", "b", "c"],
        },
      ],
    };
    const restored = clone(c);
    expect(restored.groups[0].symbolIds).toEqual(["a", "b", "c"]);
  });
});
