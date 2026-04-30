import { describe, expect, it } from "vitest";
import { tagSymbolWithFact, tagSymbolWithNewFact } from "./tag";
import { parseNotes } from "./parse";
import { UNASSIGNED_FACT_NAME } from "./types";

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function tagId(notes: string, symbolId: string, factId: string) {
  const parsed = parseNotes(notes);
  return tagSymbolWithFact(notes, parsed, symbolId, factId);
}

function tagNew(notes: string, symbolId: string, factName: string) {
  const parsed = parseNotes(notes);
  return tagSymbolWithNewFact(notes, parsed, symbolId, factName);
}

describe("tagSymbolWithFact (existing factId)", () => {
  it("appends a bullet to the target fact", () => {
    const initial = `## Fact A\n## Fact B\n`;
    const parsed = parseNotes(initial);
    const factB = parsed.rootFacts[1];
    const r = tagSymbolWithFact(initial, parsed, UUID_A, factB.factId);
    expect(r.alreadyTagged).toBe(false);
    expect(r.newNotes).toContain(`## Fact B\n* {sym:${UUID_A}} `);
  });

  it("is idempotent — re-tagging the same symbol is a no-op", () => {
    const initial = `## Fact A\n* {sym:${UUID_A}} \n`;
    const parsed = parseNotes(initial);
    const factA = parsed.rootFacts[0];
    const r = tagSymbolWithFact(initial, parsed, UUID_A, factA.factId);
    expect(r.alreadyTagged).toBe(true);
    expect(r.newNotes).toBe(initial);
  });

  it("returns notes unchanged when factId is not in parsed", () => {
    const initial = `## Fact A\n`;
    const r = tagId(initial, UUID_A, "ghost::fact-id#0");
    expect(r.newNotes).toBe(initial);
    expect(r.alreadyTagged).toBe(false);
  });

  it("multiple symbols can share one fact", () => {
    const initial = `## Fact A\n`;
    const parsed = parseNotes(initial);
    const factA = parsed.rootFacts[0];
    const first = tagSymbolWithFact(initial, parsed, UUID_A, factA.factId);
    const reparsed = parseNotes(first.newNotes);
    const second = tagSymbolWithFact(
      first.newNotes,
      reparsed,
      UUID_B,
      factA.factId,
    );
    // insertSymbolBullet trims trailing whitespace before inserting, so the
    // first bullet's trailing space gets elided and the new bullet's trailing
    // space lands ahead of the original `\n`, yielding two spaces there.
    expect(second.newNotes).toBe(
      `## Fact A\n* {sym:${UUID_A}}\n* {sym:${UUID_B}}  \n`,
    );
  });

  it("one symbol can be tagged across multiple facts (multi-tag)", () => {
    const initial = `## Fact A\n## Fact B\n`;
    const parsed = parseNotes(initial);
    const factA = parsed.rootFacts[0];
    const factB = parsed.rootFacts[1];
    const first = tagSymbolWithFact(initial, parsed, UUID_A, factA.factId);
    const reparsed = parseNotes(first.newNotes);
    const second = tagSymbolWithFact(
      first.newNotes,
      reparsed,
      UUID_A,
      factB.factId,
    );
    const final = parseNotes(second.newNotes);
    expect(final.factsBySymbolId.get(UUID_A)).toHaveLength(2);
  });
});

describe("tagSymbolWithNewFact (creating heading)", () => {
  it("creates `## Name\\n* {sym:...} ` in an empty doc", () => {
    const r = tagNew("", UUID_A, "Sodium balance");
    expect(r.createdFact).toBe(true);
    expect(r.newNotes).toBe(`## Sodium balance\n* {sym:${UUID_A}} \n`);
  });

  it("appends new heading at end of existing doc with one blank line gap", () => {
    const initial = `## Fact A\n* {sym:${UUID_B}} a\n`;
    const r = tagNew(initial, UUID_A, "Fact B");
    expect(r.createdFact).toBe(true);
    expect(r.newNotes).toBe(
      `## Fact A\n* {sym:${UUID_B}} a\n\n## Fact B\n* {sym:${UUID_A}} \n`,
    );
  });

  it("reuses an existing fact when name matches case-insensitively (no duplicate)", () => {
    const initial = `## Sodium balance\n`;
    const r = tagNew(initial, UUID_A, "sodium balance");
    expect(r.createdFact).toBe(false);
    expect(r.alreadyTagged).toBe(false);
    expect(r.newNotes).toBe(`## Sodium balance\n* {sym:${UUID_A}} \n`);
  });

  it("is idempotent through name match — duplicate names do not create a second heading", () => {
    const initial = `## Sodium balance\n* {sym:${UUID_A}} \n`;
    const r = tagNew(initial, UUID_A, "Sodium balance");
    expect(r.alreadyTagged).toBe(true);
    expect(r.newNotes).toBe(initial);
  });

  it("rejects empty / whitespace-only names", () => {
    const r1 = tagNew("## Fact A\n", UUID_A, "");
    const r2 = tagNew("## Fact A\n", UUID_A, "   ");
    expect(r1.newNotes).toBe("## Fact A\n");
    expect(r2.newNotes).toBe("## Fact A\n");
    expect(r1.createdFact).toBe(false);
    expect(r2.createdFact).toBe(false);
  });

  it("refuses to create a fact named exactly Unassigned (preserves sentinel)", () => {
    const r = tagNew("", UUID_A, UNASSIGNED_FACT_NAME);
    expect(r.createdFact).toBe(false);
    expect(r.newNotes).toBe("");
  });

  it("trims surrounding whitespace from the new fact name", () => {
    const r = tagNew("", UUID_A, "  Sodium balance  ");
    expect(r.newNotes).toBe(`## Sodium balance\n* {sym:${UUID_A}} \n`);
  });

  it("output round-trips through parser with one symbol bound to one new fact", () => {
    const r = tagNew("", UUID_A, "Vasopressin");
    const parsed = parseNotes(r.newNotes);
    expect(parsed.factsById.size).toBe(1);
    expect(parsed.factsBySymbolId.get(UUID_A)).toEqual([r.factId]);
  });
});
