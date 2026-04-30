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

describe("tag integration — bulk + cross-section", () => {
  const UUID_C = "12345678-1234-1234-1234-123456789abc";
  const UUID_D = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const UUID_E = "00000000-0000-0000-0000-000000000001";

  it("bulk: 5 sequential tags to same fact produce 5 unique bullets, no dupes", () => {
    let notes = `## Bulk\n`;
    const ids = [UUID_A, UUID_B, UUID_C, UUID_D, UUID_E];
    for (const id of ids) {
      const parsed = parseNotes(notes);
      const factId = parsed.rootFacts[0].factId;
      const r = tagSymbolWithFact(notes, parsed, id, factId);
      notes = r.newNotes;
    }
    const finalParsed = parseNotes(notes);
    const fact = finalParsed.rootFacts[0];
    expect(fact.symbolRefs).toHaveLength(5);
    expect(fact.symbolRefs.map((r) => r.symbolId)).toEqual(ids);
    // Re-tagging any of them is a no-op
    const reTagged = tagSymbolWithFact(notes, finalParsed, UUID_A, fact.factId);
    expect(reTagged.alreadyTagged).toBe(true);
    expect(reTagged.newNotes).toBe(notes);
  });

  it("mixed bulk: existing-fact + new-fact tagging in one sequence", () => {
    // Start with one fact, add to it, then create a new fact for two more.
    let notes = `## A\n`;
    let r1 = tagId(notes, UUID_A, parseNotes(notes).rootFacts[0].factId);
    notes = r1.newNotes;
    let r2 = tagId(notes, UUID_B, parseNotes(notes).rootFacts[0].factId);
    notes = r2.newNotes;
    let r3 = tagNew(notes, UUID_C, "B");
    notes = r3.newNotes;
    let r4 = tagId(notes, UUID_D, parseNotes(notes).factsById.get(r3.factId)!.factId);
    notes = r4.newNotes;

    const final = parseNotes(notes);
    expect(final.rootFacts).toHaveLength(2);
    expect(final.rootFacts[0].symbolRefs.map((r) => r.symbolId)).toEqual([UUID_A, UUID_B]);
    expect(final.rootFacts[1].symbolRefs.map((r) => r.symbolId)).toEqual([UUID_C, UUID_D]);
  });

  it("respects factId — same fact name across sections produces distinct factIds", () => {
    const initial = `# Sec A\n## Foo\n# Sec B\n## Foo\n`;
    const parsed = parseNotes(initial);
    const facts = Array.from(parsed.factsById.values());
    expect(facts).toHaveLength(2);
    const [factA, factB] = facts;
    expect(factA.factId).not.toBe(factB.factId);
    // Tag UUID_A to factA only; verify factB doesn't pick it up
    const r = tagSymbolWithFact(initial, parsed, UUID_A, factA.factId);
    const reparsed = parseNotes(r.newNotes);
    const factsBySymbol = reparsed.factsBySymbolId.get(UUID_A);
    expect(factsBySymbol).toEqual([factA.factId]);
  });
});
