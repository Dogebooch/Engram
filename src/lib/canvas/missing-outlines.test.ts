import { describe, expect, it } from "vitest";
import { parseNotes } from "@/lib/notes/parse";
import type { RegionSymbolLayer, SymbolLayer } from "@/lib/types/canvas";
import { describeSymbol, findMissingOutlines } from "./missing-outlines";

const AAA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BBB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CCC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const base = {
  x: 0,
  y: 0,
  width: 50,
  height: 50,
  rotation: 0,
  layerIndex: 0,
  groupId: null,
  animation: null,
  animationDelay: null,
  animationDuration: null,
} as const;

function rect(id: string): RegionSymbolLayer {
  return { ...base, id, kind: "region", ref: null, shape: "rect" };
}

function polygon(id: string): RegionSymbolLayer {
  return {
    ...base,
    id,
    kind: "region",
    ref: null,
    shape: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ],
  };
}

describe("findMissingOutlines", () => {
  it("flags rect regions, missing layers; skips traced polygons; preserves order", () => {
    const notes = [
      "# Section",
      "## Fact One",
      `* {sym:${AAA}} Banner desc → meaning`,
      "## Fact Two",
      `* {sym:${BBB}} Already traced → m`,
      "## Fact Three",
      `* {sym:${CCC}} No layer at all → m`,
    ].join("\n");
    const parsed = parseNotes(notes);
    const symbols: SymbolLayer[] = [rect(AAA), polygon(BBB)]; // CCC absent

    const missing = findMissingOutlines(notes, parsed, symbols);

    expect(missing.map((m) => m.symbolId)).toEqual([AAA, CCC]);
    expect(missing[0].description).toBe("Banner desc");
    expect(missing[0].factId).toBeTruthy();
  });

  it("de-dupes a symbol referenced under multiple facts", () => {
    const notes = [
      "## Fact One",
      `* {sym:${AAA}} desc one → m`,
      "## Fact Two",
      `* {sym:${AAA}} desc two → m`,
    ].join("\n");
    const parsed = parseNotes(notes);

    const missing = findMissingOutlines(notes, parsed, [rect(AAA)]);

    expect(missing).toHaveLength(1);
    expect(missing[0].symbolId).toBe(AAA);
  });

  it("returns empty when every symbol has a polygon", () => {
    const notes = ["## Fact", `* {sym:${AAA}} desc → m`].join("\n");
    const parsed = parseNotes(notes);
    expect(findMissingOutlines(notes, parsed, [polygon(AAA)])).toEqual([]);
  });
});

describe("describeSymbol", () => {
  it("returns the bullet description for a symbol id", () => {
    const notes = ["## Fact", `* {sym:${AAA}} The banner → meaning; why`].join("\n");
    const parsed = parseNotes(notes);
    expect(describeSymbol(notes, parsed, AAA)).toBe("The banner");
  });

  it("returns null for an unknown symbol id", () => {
    const notes = ["## Fact", `* {sym:${AAA}} x → y`].join("\n");
    const parsed = parseNotes(notes);
    expect(describeSymbol(notes, parsed, BBB)).toBeNull();
  });
});
