import { describe, expect, it } from "vitest";
import { getOrderedFacts } from "./fact-order";
import { parseNotes } from "./parse";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("getOrderedFacts", () => {
  it("preserves document order across root facts and sections", () => {
    const notes = `## Alpha
* {sym:${A}} a

# Section One
## Beta
* {sym:${B}} b

# Section Two
## Gamma
* {sym:${A}} c
`;
    const parsed = parseNotes(notes);
    const order = getOrderedFacts(parsed).map((f) => f.name);
    expect(order).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("excludes the Unassigned synthetic fact by default", () => {
    const notes = `## Unassigned
* {sym:${A}} unassigned

## Real
* {sym:${B}} real
`;
    const parsed = parseNotes(notes);
    const order = getOrderedFacts(parsed).map((f) => f.name);
    expect(order).toEqual(["Real"]);
  });

  it("excludes empty facts by default (no symbol refs)", () => {
    const notes = `## Empty
## NotEmpty
* {sym:${A}} body
`;
    const parsed = parseNotes(notes);
    const order = getOrderedFacts(parsed).map((f) => f.name);
    expect(order).toEqual(["NotEmpty"]);
  });

  it("includeEmpty: true keeps empty facts", () => {
    const notes = `## Empty
## NotEmpty
* {sym:${A}} body
`;
    const parsed = parseNotes(notes);
    const order = getOrderedFacts(parsed, { includeEmpty: true }).map(
      (f) => f.name,
    );
    expect(order).toEqual(["Empty", "NotEmpty"]);
  });

  it("includeUnassigned: true keeps Unassigned", () => {
    const notes = `## Unassigned
* {sym:${A}} u
`;
    const parsed = parseNotes(notes);
    const order = getOrderedFacts(parsed, { includeUnassigned: true }).map(
      (f) => f.name,
    );
    expect(order).toEqual(["Unassigned"]);
  });

  it("returns empty array when no facts qualify", () => {
    const parsed = parseNotes("# Just a section heading");
    expect(getOrderedFacts(parsed)).toEqual([]);
  });
});
