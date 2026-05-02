import { describe, expect, it } from "vitest";
import {
  insertFact,
  insertSection,
  insertSymbolBullet,
  nextAutoFactName,
  nextAutoSectionName,
  readSymbolDescription,
} from "./insert";
import { parseNotes } from "./parse";
import { UNASSIGNED_FACT_NAME } from "./types";

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const UUID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function insert(notes: string, factId: string | null, uuid: string) {
  const parsed = parseNotes(notes);
  return insertSymbolBullet(notes, parsed, factId, uuid);
}

describe("insertSymbolBullet", () => {
  it("creates ## Fact 1 in an empty doc", () => {
    const r = insert("", null, UUID_A);
    expect(r.newNotes).toBe(`## Fact 1\n* {sym:${UUID_A}} `);
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

  it("reuses existing legacy ## Unassigned heading", () => {
    const initial = `## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} a\n`;
    const parsed = parseNotes(initial);
    const r = insertSymbolBullet(initial, parsed, null, UUID_B);
    expect(r.newNotes).toBe(
      `## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} a\n* {sym:${UUID_B}} \n`,
    );
    expect(r.factId).toBe(parsed.unassignedFactId);
  });

  it("reuses highest-ordinal Fact N as auto-fact", () => {
    const initial = `## Fact 1\n* {sym:${UUID_A}} a\n`;
    const parsed = parseNotes(initial);
    const r = insertSymbolBullet(initial, parsed, null, UUID_B);
    expect(r.newNotes).toBe(
      `## Fact 1\n* {sym:${UUID_A}} a\n* {sym:${UUID_B}} \n`,
    );
  });

  it("appends ## Fact N+1 at end when no auto-fact slot exists", () => {
    const initial = `## Pathology\n* {sym:${UUID_A}} a\n`;
    const r = insert(initial, null, UUID_B);
    expect(r.newNotes).toBe(
      `## Pathology\n* {sym:${UUID_A}} a\n\n## Fact 1\n* {sym:${UUID_B}} `,
    );
  });

  it("falls back to auto-fact creation when factId is unknown", () => {
    const initial = `## Pathology\n* {sym:${UUID_A}} a\n`;
    const r = insert(initial, "nonexistent-fact-id", UUID_B);
    expect(r.newNotes).toContain(`## Fact 1\n* {sym:${UUID_B}} `);
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

  it("repeated drops reuse the auto-fact (no Fact 2 spam)", () => {
    let notes = "";
    let r = insert(notes, null, UUID_A);
    notes = r.newNotes;
    r = insert(notes, null, UUID_B);
    notes = r.newNotes;
    const parsed = parseNotes(notes);
    expect(parsed.factsById.size).toBe(1);
    const fact = parsed.factsById.values().next().value!;
    expect(fact.name).toBe("Fact 1");
    expect(fact.symbolRefs).toHaveLength(2);
  });
});

describe("nextAutoFactName", () => {
  it("returns Fact 1 for empty doc", () => {
    expect(nextAutoFactName(parseNotes(""))).toBe("Fact 1");
  });

  it("returns Fact 1 when no Fact N facts exist", () => {
    expect(nextAutoFactName(parseNotes("## Pathology\n## Risk Factors\n"))).toBe(
      "Fact 1",
    );
  });

  it("returns next ordinal after the highest existing Fact N", () => {
    expect(nextAutoFactName(parseNotes("## Fact 1\n## Fact 2\n"))).toBe("Fact 3");
  });

  it("skips gaps — next-after-max, not next-empty-slot", () => {
    expect(nextAutoFactName(parseNotes("## Fact 3\n"))).toBe("Fact 4");
  });

  it("ignores facts whose names contain ordinals but don't match `Fact N` exactly", () => {
    expect(
      nextAutoFactName(parseNotes(`## Fact 1 Notes\n## My Fact 5\n## Fact 1\n`)),
    ).toBe("Fact 2");
  });

  it(`auto-fact slot prefers legacy ${UNASSIGNED_FACT_NAME} over Fact N`, () => {
    const initial = `## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} a\n## Fact 5\n`;
    const parsed = parseNotes(initial);
    const r = insertSymbolBullet(initial, parsed, null, UUID_C);
    expect(r.newNotes).toBe(
      `## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} a\n* {sym:${UUID_C}} \n## Fact 5\n`,
    );
  });
});

describe("nextAutoSectionName", () => {
  it("returns Section 1 when none exist", () => {
    expect(nextAutoSectionName(parseNotes(""))).toBe("Section 1");
    expect(nextAutoSectionName(parseNotes("## Fact A\n"))).toBe("Section 1");
  });

  it("picks max + 1 across `Section N` headings", () => {
    expect(
      nextAutoSectionName(parseNotes("# Section 1\n# Section 3\n")),
    ).toBe("Section 4");
  });

  it("ignores h1s whose names don't match `Section N` exactly", () => {
    expect(
      nextAutoSectionName(parseNotes("# Pharmacology\n# Section 5 Notes\n")),
    ).toBe("Section 1");
  });
});

describe("insertSection", () => {
  it("seeds `# Section 1` in an empty doc", () => {
    const parsed = parseNotes("");
    const r = insertSection("", parsed);
    expect(r.newNotes).toBe("# Section 1\n");
    expect(r.sectionId).toBeTruthy();
  });

  it("appends with one blank-line gap from existing content", () => {
    const initial = `## Fact A\n* {sym:${UUID_A}} a\n`;
    const parsed = parseNotes(initial);
    const r = insertSection(initial, parsed);
    expect(r.newNotes).toBe(`## Fact A\n* {sym:${UUID_A}} a\n\n# Section 1\n`);
  });

  it("uses an explicit name when provided", () => {
    const r = insertSection("", parseNotes(""), "Pharmacology");
    expect(r.newNotes).toBe("# Pharmacology\n");
  });

  it("trims whitespace-only names and falls back to the auto ordinal", () => {
    const r = insertSection("", parseNotes(""), "   ");
    expect(r.newNotes).toBe("# Section 1\n");
  });

  it("returns a sectionId that resolves through parseNotes", () => {
    const initial = "# Already Here\n";
    const r = insertSection(initial, parseNotes(initial), "Fresh");
    const reparsed = parseNotes(r.newNotes);
    expect(reparsed.sections.find((s) => s.sectionId === r.sectionId)?.name)
      .toBe("Fresh");
  });
});

describe("insertFact", () => {
  it("appends a top-level `## Fact N` when sectionId is null", () => {
    const r = insertFact("", parseNotes(""), null);
    expect(r.newNotes).toBe("## Fact 1\n");
    expect(r.factId).toBeTruthy();
  });

  it("inserts under the named section, before the next section", () => {
    const initial = `# A\n## Fact 1\n# B\n## Fact 7\n`;
    const parsed = parseNotes(initial);
    const sectionA = parsed.sections.find((s) => s.name === "A");
    expect(sectionA).toBeTruthy();
    const r = insertFact(initial, parsed, sectionA!.sectionId);
    // nextAutoFactName picks max+1 across the whole doc → Fact 8.
    // Lands between Fact 1 and Section B with a blank-line gap.
    expect(r.newNotes).toBe(`# A\n## Fact 1\n\n## Fact 8\n# B\n## Fact 7\n`);
  });

  it("inserts at end of doc when the section is the last one", () => {
    const initial = `# A\n## Mechanism\n* {sym:${UUID_A}} body\n`;
    const parsed = parseNotes(initial);
    const sectionA = parsed.sections[0];
    const r = insertFact(initial, parsed, sectionA.sectionId);
    // No `Fact N` heading exists yet, so the auto-name starts at Fact 1.
    expect(r.newNotes).toBe(
      `# A\n## Mechanism\n* {sym:${UUID_A}} body\n\n## Fact 1\n`,
    );
  });

  it("uses the provided name when given", () => {
    const r = insertFact("# A\n", parseNotes("# A\n"), null, "Mechanism");
    expect(r.newNotes).toBe("# A\n\n## Mechanism\n");
  });

  it("falls back to top-level append when sectionId is unknown", () => {
    const r = insertFact("# A\n", parseNotes("# A\n"), "ghost::id#0");
    // Behaves like insertFact(notes, parsed, null) — append at end.
    expect(r.newNotes).toBe("# A\n\n## Fact 1\n");
  });

  it("returns a factId that resolves through parseNotes", () => {
    const initial = "# A\n";
    const parsed = parseNotes(initial);
    const sectionId = parsed.sections[0].sectionId;
    const r = insertFact(initial, parsed, sectionId, "Targeted");
    const reparsed = parseNotes(r.newNotes);
    expect(reparsed.factsById.get(r.factId)?.name).toBe("Targeted");
  });
});

describe("readSymbolDescription", () => {
  it("returns trailing text after the chip", () => {
    const notes = `## Fact A\n* {sym:${UUID_A}} a useful note\n`;
    const parsed = parseNotes(notes);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    expect(readSymbolDescription(notes, ref)).toBe("a useful note");
  });

  it("returns empty string when the bullet has no description", () => {
    const notes = `## Fact A\n* {sym:${UUID_A}}\n`;
    const parsed = parseNotes(notes);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    expect(readSymbolDescription(notes, ref)).toBe("");
  });

  it("handles end-of-doc bullets without a trailing newline", () => {
    const notes = `## Fact A\n* {sym:${UUID_A}} last`;
    const parsed = parseNotes(notes);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    expect(readSymbolDescription(notes, ref)).toBe("last");
  });
});
