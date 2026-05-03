import { describe, expect, it } from "vitest";
import {
  moveFact,
  moveSection,
  removeAllSymbolReferences,
  replaceSymbolUuid,
  setFactName,
  setSectionName,
  setSymbolDescription,
  untagSymbolFromFact,
} from "./insert";
import { parseNotes } from "./parse";

const A = "11111111-2222-3333-4444-555555555555";
const B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("untagSymbolFromFact", () => {
  it("removes the bullet line containing the chip", () => {
    const notes = `## Fact A\n* {sym:${A}} first\n* {sym:${B}} second\n`;
    const parsed = parseNotes(notes);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    const out = untagSymbolFromFact(notes, ref);
    expect(out).toBe(`## Fact A\n* {sym:${B}} second\n`);
  });

  it("removes a bullet on the last line without a trailing newline", () => {
    const notes = `## Fact A\n* {sym:${A}} only`;
    const parsed = parseNotes(notes);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    const out = untagSymbolFromFact(notes, ref);
    expect(out).toBe(`## Fact A\n`);
  });

  it("keeps the canvas symbol intact when there are sibling refs", () => {
    const notes = `## Fact A\n* {sym:${A}} a\n## Fact B\n* {sym:${A}} also a\n`;
    const parsed = parseNotes(notes);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    const out = untagSymbolFromFact(notes, ref);
    expect(out).toBe(`## Fact A\n## Fact B\n* {sym:${A}} also a\n`);
    expect(out).toContain(A); // still referenced under Fact B
  });
});

describe("replaceSymbolUuid", () => {
  it("rewrites every chip with the same uuid", () => {
    const notes = `## Fact\n* {sym:${A}} a1\n* {sym:${A}} a2\n* {sym:${B}} b\n`;
    const out = replaceSymbolUuid(notes, A, C);
    expect(out).toBe(`## Fact\n* {sym:${C}} a1\n* {sym:${C}} a2\n* {sym:${B}} b\n`);
  });

  it("returns the input unchanged when oldUuid === newUuid", () => {
    const notes = `* {sym:${A}}`;
    expect(replaceSymbolUuid(notes, A, A)).toBe(notes);
  });
});

describe("setSymbolDescription", () => {
  it("replaces the trailing description text", () => {
    const notes = `* {sym:${A}} old description\n`;
    const parsed = parseNotes(`## F\n${notes}`);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    const full = `## F\n${notes}`;
    const out = setSymbolDescription(full, ref, "new description");
    expect(out).toBe(`## F\n* {sym:${A}} new description\n`);
  });

  it("trims surrounding whitespace from the new description", () => {
    const full = `## F\n* {sym:${A}} old\n`;
    const parsed = parseNotes(full);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    const out = setSymbolDescription(full, ref, "   spacy   ");
    expect(out).toBe(`## F\n* {sym:${A}} spacy\n`);
  });

  it("clears the description when given an empty string", () => {
    const full = `## F\n* {sym:${A}} old\n`;
    const parsed = parseNotes(full);
    const ref = parsed.rootFacts[0].symbolRefs[0];
    const out = setSymbolDescription(full, ref, "");
    expect(out).toBe(`## F\n* {sym:${A}}\n`);
  });
});

describe("removeAllSymbolReferences", () => {
  it("strips every bullet that references the uuid", () => {
    const notes = `## A\n* {sym:${A}} one\n* {sym:${B}} keep\n## B\n* {sym:${A}} two\n`;
    const out = removeAllSymbolReferences(notes, A);
    expect(out).toBe(`## A\n* {sym:${B}} keep\n## B\n`);
  });
});

describe("moveFact", () => {
  it("reorders facts within a section", () => {
    const notes = `# S\n\n## A\n\n## B\n\n## C\n`;
    const parsed = parseNotes(notes);
    const factC = parsed.sections[0].facts[2];
    const factA = parsed.sections[0].facts[0];
    const out = moveFact(notes, parsed, factC.factId, {
      kind: "before-fact",
      factId: factA.factId,
    });
    const reparsed = parseNotes(out);
    expect(reparsed.sections[0].facts.map((f) => f.name)).toEqual(["C", "A", "B"]);
  });

  it("moves a fact across sections", () => {
    const notes = `# S1\n\n## A\n\n## B\n\n# S2\n\n## C\n`;
    const parsed = parseNotes(notes);
    const factA = parsed.sections[0].facts[0];
    const out = moveFact(notes, parsed, factA.factId, {
      kind: "section-end",
      sectionId: parsed.sections[1].sectionId,
    });
    const reparsed = parseNotes(out);
    expect(reparsed.sections[0].facts.map((f) => f.name)).toEqual(["B"]);
    expect(reparsed.sections[1].facts.map((f) => f.name)).toEqual(["C", "A"]);
  });
});

describe("setFactName", () => {
  it("renames a fact heading in place", () => {
    const notes = `# S\n\n## Old\n* {sym:${A}} body\n\n## Other\n`;
    const parsed = parseNotes(notes);
    const fact = parsed.sections[0].facts[0];
    const out = setFactName(notes, parsed, fact.factId, "New Name");
    expect(out).toBe(`# S\n\n## New Name\n* {sym:${A}} body\n\n## Other\n`);
  });

  it("disambiguates same-named facts across sections by factId", () => {
    const notes = `# S1\n\n## Twin\n\n# S2\n\n## Twin\n`;
    const parsed = parseNotes(notes);
    const factInS2 = parsed.sections[1].facts[0];
    const out = setFactName(notes, parsed, factInS2.factId, "Renamed");
    expect(out).toBe(`# S1\n\n## Twin\n\n# S2\n\n## Renamed\n`);
  });

  it("returns notes unchanged when the new name is empty or whitespace", () => {
    const notes = `## Keep\n`;
    const parsed = parseNotes(notes);
    const fact = parsed.rootFacts[0];
    expect(setFactName(notes, parsed, fact.factId, "")).toBe(notes);
    expect(setFactName(notes, parsed, fact.factId, "   ")).toBe(notes);
  });
});

describe("setSectionName", () => {
  it("renames a section heading in place", () => {
    const notes = `# Old\n\n## A\n\n# Other\n`;
    const parsed = parseNotes(notes);
    const out = setSectionName(notes, parsed, parsed.sections[0].sectionId, "New");
    expect(out).toBe(`# New\n\n## A\n\n# Other\n`);
  });

  it("returns notes unchanged for empty section name", () => {
    const notes = `# Keep\n\n## A\n`;
    const parsed = parseNotes(notes);
    expect(setSectionName(notes, parsed, parsed.sections[0].sectionId, "  ")).toBe(notes);
  });
});

describe("moveSection", () => {
  it("reorders sections at the document level", () => {
    const notes = `# Alpha\n\n## a\n\n# Beta\n\n## b\n\n# Gamma\n\n## c\n`;
    const parsed = parseNotes(notes);
    const out = moveSection(notes, parsed, parsed.sections[2].sectionId, {
      kind: "before-section",
      sectionId: parsed.sections[0].sectionId,
    });
    const reparsed = parseNotes(out);
    expect(reparsed.sections.map((s) => s.name)).toEqual(["Gamma", "Alpha", "Beta"]);
  });
});
