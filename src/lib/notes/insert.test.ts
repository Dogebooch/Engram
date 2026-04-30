import { describe, expect, it } from "vitest";
import { insertSymbolBullet } from "./insert";
import { parseNotes } from "./parse";
import { UNASSIGNED_FACT_NAME } from "./types";

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function insert(notes: string, factId: string | null, uuid: string) {
  const parsed = parseNotes(notes);
  return insertSymbolBullet(notes, parsed, factId, uuid);
}

describe("insertSymbolBullet", () => {
  it("creates ## Unassigned in an empty doc", () => {
    const r = insert("", null, UUID_A);
    expect(r.newNotes).toBe(`## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} `);
    expect(r.factId).toBeTruthy();
  });

  it("appends bullet under existing fact when factId provided", () => {
    const initial = `## Fact A\n* {sym:${UUID_A}} first\n`;
    const parsed = parseNotes(initial);
    const factId = parsed.rootFacts[0].factId;
    const r = insertSymbolBullet(initial, parsed, factId, UUID_B);
    expect(r.newNotes).toBe(
      `## Fact A\n* {sym:${UUID_A}} first\n* {sym:${UUID_B}} \n`,
    );
  });

  it("appends bullet under fact with no existing bullets", () => {
    const initial = `## Fact A\n## Fact B\n* {sym:${UUID_A}} b\n`;
    const parsed = parseNotes(initial);
    const factA = parsed.rootFacts[0];
    const r = insertSymbolBullet(initial, parsed, factA.factId, UUID_B);
    expect(r.newNotes).toBe(
      `## Fact A\n* {sym:${UUID_B}} \n## Fact B\n* {sym:${UUID_A}} b\n`,
    );
  });

  it("inserts before the next heading without merging lines", () => {
    const initial = `## Fact A\n* one\n\n## Fact B\n`;
    const parsed = parseNotes(initial);
    const factA = parsed.rootFacts[0];
    const r = insertSymbolBullet(initial, parsed, factA.factId, UUID_A);
    expect(r.newNotes).toBe(
      `## Fact A\n* one\n* {sym:${UUID_A}} \n\n## Fact B\n`,
    );
  });

  it("reuses existing ## Unassigned instead of creating a duplicate", () => {
    const initial = `## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} a\n`;
    const parsed = parseNotes(initial);
    const r = insertSymbolBullet(initial, parsed, null, UUID_B);
    expect(r.newNotes).toBe(
      `## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} a\n* {sym:${UUID_B}} \n`,
    );
    expect(r.factId).toBe(parsed.unassignedFactId);
  });

  it("appends ## Unassigned at end when none exists and factId is null", () => {
    const initial = `## Fact A\n* {sym:${UUID_A}} a\n`;
    const r = insert(initial, null, UUID_B);
    expect(r.newNotes).toBe(
      `## Fact A\n* {sym:${UUID_A}} a\n\n## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_B}} `,
    );
  });

  it("falls back to Unassigned when factId is unknown", () => {
    const initial = `## Fact A\n* {sym:${UUID_A}} a\n`;
    const r = insert(initial, "nonexistent-fact-id", UUID_B);
    expect(r.newNotes).toContain(`## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_B}} `);
  });

  it("returns selection offset at end of inserted bullet (cursor-ready)", () => {
    const initial = `## Fact A\n`;
    const parsed = parseNotes(initial);
    const factA = parsed.rootFacts[0];
    const r = insertSymbolBullet(initial, parsed, factA.factId, UUID_A);
    expect(r.newNotes.slice(0, r.selection)).toBe(
      `## Fact A\n* {sym:${UUID_A}} `,
    );
  });

  it("repeated drops produce parseable output", () => {
    let notes = "";
    let r = insert(notes, null, UUID_A);
    notes = r.newNotes;
    r = insert(notes, null, UUID_B);
    notes = r.newNotes;
    const parsed = parseNotes(notes);
    expect(parsed.factsById.size).toBe(1);
    const fact = parsed.factsById.values().next().value!;
    expect(fact.symbolRefs).toHaveLength(2);
  });
});
