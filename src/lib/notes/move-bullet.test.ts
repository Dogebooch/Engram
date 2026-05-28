import { describe, expect, it } from "vitest";
import { moveSymbolBulletToFact } from "./move-bullet";
import { parseNotes } from "./parse";

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function move(notes: string, symbolId: string, fromIndex: number, toIndex: number) {
  const parsed = parseNotes(notes);
  const facts = Array.from(parsed.factsById.values());
  return moveSymbolBulletToFact(
    notes,
    parsed,
    symbolId,
    facts[fromIndex].factId,
    facts[toIndex].factId,
  );
}

describe("moveSymbolBulletToFact", () => {
  it("moves the full bullet line and preserves description, meaning, and why", () => {
    const notes = `## Fact A
* {sym:${UUID_A}} red wheel → vascular injury; rhymes with weal
## Fact B
`;

    const result = move(notes, UUID_A, 0, 1);

    expect(result).toMatchObject({ ok: true, moved: true });
    expect(result.newNotes).toBe(`## Fact A
## Fact B
* {sym:${UUID_A}} red wheel → vascular injury; rhymes with weal
`);
  });

  it("moves under a target fact that already has bullets", () => {
    const notes = `## Fact A
* {sym:${UUID_A}} red wheel
## Fact B
* {sym:${UUID_B}} blue heart
`;

    const result = move(notes, UUID_A, 0, 1);

    expect(result.newNotes).toBe(`## Fact A
## Fact B
* {sym:${UUID_B}} blue heart
* {sym:${UUID_A}} red wheel
`);
  });

  it("does not duplicate when target already has the symbol", () => {
    const notes = `## Fact A
* {sym:${UUID_A}} first copy
## Fact B
* {sym:${UUID_A}} existing copy
`;

    const result = move(notes, UUID_A, 0, 1);

    expect(result).toMatchObject({ ok: true, moved: true });
    expect(result.newNotes).toBe(`## Fact A
## Fact B
* {sym:${UUID_A}} existing copy
`);
  });

  it("returns a no-op when moving within the same fact", () => {
    const notes = `## Fact A
* {sym:${UUID_A}} red wheel
`;
    const parsed = parseNotes(notes);
    const factId = parsed.rootFacts[0].factId;

    const result = moveSymbolBulletToFact(notes, parsed, UUID_A, factId, factId);

    expect(result).toEqual({ newNotes: notes, ok: true, moved: false });
  });

  it("fails without changing notes when the source symbol is missing", () => {
    const notes = `## Fact A
* {sym:${UUID_A}} red wheel
## Fact B
`;

    const result = move(notes, UUID_B, 0, 1);

    expect(result).toEqual({ newNotes: notes, ok: false, moved: false });
  });

  it("can move a raw symbol-token line inside a fact even if markdown is malformed", () => {
    const notes = `## Fact A
  {sym:${UUID_A}} blue heart
## Fact B
`;

    const result = move(notes, UUID_A, 0, 1);

    expect(result).toMatchObject({ ok: true, moved: true });
    expect(result.newNotes).toBe(`## Fact A
## Fact B
  {sym:${UUID_A}} blue heart
`);
  });
});
