import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { UNASSIGNED_FACT_NAME } from "./types";

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const UUID_C = "12345678-1234-1234-1234-123456789abc";

describe("parseNotes", () => {
  it("returns empty parsed notes for empty input", () => {
    const r = parseNotes("");
    expect(r.sections).toEqual([]);
    expect(r.rootFacts).toEqual([]);
    expect(r.factsById.size).toBe(0);
    expect(r.factsBySymbolId.size).toBe(0);
    expect(r.unassignedFactId).toBeNull();
    expect(r.docLength).toBe(0);
  });

  it("parses a flat doc with no section, just facts", () => {
    const md = `## Fact A\n* {sym:${UUID_A}} description one\n* {sym:${UUID_B}} description two\n`;
    const r = parseNotes(md);
    expect(r.sections).toHaveLength(0);
    expect(r.rootFacts).toHaveLength(1);
    const fact = r.rootFacts[0];
    expect(fact.name).toBe("Fact A");
    expect(fact.symbolRefs).toHaveLength(2);
    expect(fact.symbolRefs.map((s) => s.symbolId)).toEqual([UUID_A, UUID_B]);
  });

  it("parses sections with nested facts", () => {
    const md = `# Section One\n## Fact A\n* {sym:${UUID_A}} foo\n# Section Two\n## Fact B\n* {sym:${UUID_B}} bar\n`;
    const r = parseNotes(md);
    expect(r.sections).toHaveLength(2);
    expect(r.sections[0].name).toBe("Section One");
    expect(r.sections[0].facts).toHaveLength(1);
    expect(r.sections[0].facts[0].name).toBe("Fact A");
    expect(r.sections[1].facts[0].name).toBe("Fact B");
    expect(r.sections[0].facts[0].sectionName).toBe("Section One");
  });

  it("disambiguates duplicate fact names by occurrence index", () => {
    const md = `## Same Name\n* {sym:${UUID_A}} a\n## Same Name\n* {sym:${UUID_B}} b\n`;
    const r = parseNotes(md);
    expect(r.rootFacts).toHaveLength(2);
    expect(r.rootFacts[0].factId).not.toBe(r.rootFacts[1].factId);
  });

  it("ignores {sym:...} inside fenced code blocks", () => {
    const md = `## Fact\n* {sym:${UUID_A}} real\n\n\`\`\`\n* {sym:${UUID_B}} fake\n\`\`\`\n`;
    const r = parseNotes(md);
    const fact = r.rootFacts[0];
    expect(fact.symbolRefs).toHaveLength(1);
    expect(fact.symbolRefs[0].symbolId).toBe(UUID_A);
  });

  it("ignores {sym:...} inside inline code", () => {
    const md = `## Fact\n* real {sym:${UUID_A}} and \`{sym:${UUID_B}}\` inline\n`;
    const r = parseNotes(md);
    const fact = r.rootFacts[0];
    expect(fact.symbolRefs).toHaveLength(1);
    expect(fact.symbolRefs[0].symbolId).toBe(UUID_A);
  });

  it("ignores malformed UUIDs", () => {
    const md = `## Fact\n* {sym:not-a-uuid} bad\n* {sym:${UUID_A}} good\n`;
    const r = parseNotes(md);
    const fact = r.rootFacts[0];
    expect(fact.symbolRefs).toHaveLength(1);
    expect(fact.symbolRefs[0].symbolId).toBe(UUID_A);
  });

  it("handles multiple symbol refs per bullet", () => {
    const md = `## Fact\n* {sym:${UUID_A}} and {sym:${UUID_B}} and {sym:${UUID_C}}\n`;
    const r = parseNotes(md);
    const fact = r.rootFacts[0];
    expect(fact.symbolRefs).toHaveLength(3);
    expect(fact.symbolRefs.map((s) => s.symbolId)).toEqual([UUID_A, UUID_B, UUID_C]);
  });

  it("indexes facts by symbol id, including multi-tagging", () => {
    const md = `## Fact A\n* {sym:${UUID_A}} a\n## Fact B\n* {sym:${UUID_A}} also a\n`;
    const r = parseNotes(md);
    const factIds = r.factsBySymbolId.get(UUID_A);
    expect(factIds).toBeDefined();
    expect(factIds!.length).toBe(2);
  });

  it("records absolute char offsets matching source positions", () => {
    const md = `## Fact\n* {sym:${UUID_A}} desc\n`;
    const r = parseNotes(md);
    const ref = r.rootFacts[0].symbolRefs[0];
    expect(md.slice(ref.start, ref.end)).toBe(`{sym:${UUID_A}}`);
  });

  it("records bodyRange that covers the body up to the next heading", () => {
    const md = `## Fact A\n* {sym:${UUID_A}} a\n## Fact B\n* {sym:${UUID_B}} b\n`;
    const r = parseNotes(md);
    const factA = r.rootFacts[0];
    const factB = r.rootFacts[1];
    expect(factA.bodyRange.to).toBe(factB.headingFrom);
  });

  it("flags an Unassigned fact when present", () => {
    const md = `## ${UNASSIGNED_FACT_NAME}\n* {sym:${UUID_A}} loose\n`;
    const r = parseNotes(md);
    expect(r.unassignedFactId).not.toBeNull();
    const fact = r.factsById.get(r.unassignedFactId!);
    expect(fact?.name).toBe(UNASSIGNED_FACT_NAME);
  });

  it("treats h1-only docs as sections without forcing a fact", () => {
    const md = `# Section Only\nsome paragraph text\n`;
    const r = parseNotes(md);
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].facts).toHaveLength(0);
    expect(r.rootFacts).toHaveLength(0);
  });

  it("is case-insensitive for symbol UUIDs and normalizes to lowercase", () => {
    const md = `## Fact\n* {sym:${UUID_A.toUpperCase()}} caps\n`;
    const r = parseNotes(md);
    expect(r.rootFacts[0].symbolRefs[0].symbolId).toBe(UUID_A);
  });

  it("disambiguates same fact name across different sections", () => {
    const md = `# Sec A\n## Foo\n* {sym:${UUID_A}} a\n# Sec B\n## Foo\n* {sym:${UUID_B}} b\n`;
    const r = parseNotes(md);
    expect(r.sections).toHaveLength(2);
    const factA = r.sections[0].facts[0];
    const factB = r.sections[1].facts[0];
    expect(factA.factId).not.toBe(factB.factId);
    expect(factA.name).toBe("Foo");
    expect(factB.name).toBe("Foo");
  });

  it("handles re-entered section names with occurrence-disambiguated factIds", () => {
    const md = `# A\n## F\n* {sym:${UUID_A}} a\n# A\n## F\n* {sym:${UUID_B}} b\n`;
    const r = parseNotes(md);
    expect(r.sections).toHaveLength(2);
    const f1 = r.sections[0].facts[0];
    const f2 = r.sections[1].facts[0];
    expect(f1.factId).not.toBe(f2.factId);
  });

  it("ignores malformed UUID variants (missing hyphens, wrong segments)", () => {
    const malformedSamples = [
      "11111111222233334444555555555555", // no hyphens
      "1111-1111-2222-3333-4444-5555-5555-5555", // wrong shape
      "g1111111-2222-3333-4444-555555555555", // non-hex char
      "11111111-2222-3333-4444-55555555555", // short last segment
    ];
    for (const bad of malformedSamples) {
      const md = `## F\n* {sym:${bad}} junk\n* {sym:${UUID_A}} good\n`;
      const r = parseNotes(md);
      const refs = r.rootFacts[0].symbolRefs.map((s) => s.symbolId);
      expect(refs).toEqual([UUID_A]);
    }
  });

  it("round-trips through a serialize/parse cycle (factsById equal)", () => {
    const original = `# Section One\n## Fact A\n* {sym:${UUID_A}} desc\n* {sym:${UUID_B}} other\n# Section Two\n## Fact B\n* {sym:${UUID_C}} more\n## Same Name\n* {sym:${UUID_A}} dup1\n## Same Name\n* {sym:${UUID_B}} dup2\n`;
    const parsed1 = parseNotes(original);
    const rebuilt = serializeForRoundtrip(parsed1);
    const parsed2 = parseNotes(rebuilt);

    expect(parsed2.factsById.size).toBe(parsed1.factsById.size);
    for (const [factId, fact1] of parsed1.factsById) {
      const fact2 = parsed2.factsById.get(factId);
      expect(fact2, `factId ${factId} preserved`).toBeDefined();
      expect(fact2!.name).toBe(fact1.name);
      expect(fact2!.sectionName).toBe(fact1.sectionName);
      expect(fact2!.symbolRefs.map((r) => r.symbolId)).toEqual(
        fact1.symbolRefs.map((r) => r.symbolId),
      );
    }
  });
});

/**
 * Reconstructs a minimal markdown doc from a ParsedNotes tree. Used only in
 * round-trip tests — not a full serializer (drops bullet text, code blocks,
 * paragraphs). Validates that synthetic factIds are stable across parse cycles.
 */
function serializeForRoundtrip(parsed: ReturnType<typeof parseNotes>): string {
  const out: string[] = [];
  const seenSection = new Set<string>();

  const emitFact = (fact: typeof parsed.rootFacts[number]) => {
    out.push(`## ${fact.name}`);
    for (const ref of fact.symbolRefs) {
      out.push(`* {sym:${ref.symbolId}}`);
    }
  };

  for (const section of parsed.sections) {
    const key = `${section.sectionId}`;
    if (!seenSection.has(key)) {
      out.push(`# ${section.name}`);
      seenSection.add(key);
    }
    for (const fact of section.facts) emitFact(fact);
  }
  for (const fact of parsed.rootFacts) emitFact(fact);
  return out.join("\n") + "\n";
}
