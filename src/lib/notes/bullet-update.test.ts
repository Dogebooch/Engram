import { describe, it, expect } from "vitest";
import { formatBulletBody, updateBulletParts } from "./bullet";
import { parseNotes } from "./parse";

describe("formatBulletBody", () => {
  it("emits description only when meaning and encoding are empty", () => {
    expect(formatBulletBody({ description: "Wheelchair", meaning: null, encoding: null })).toBe(
      "Wheelchair",
    );
    expect(formatBulletBody({ description: "Wheelchair", meaning: "", encoding: "" })).toBe(
      "Wheelchair",
    );
  });

  it("emits description + meaning when encoding is empty", () => {
    expect(
      formatBulletBody({ description: "Wheelchair", meaning: "stasis", encoding: null }),
    ).toBe("Wheelchair → stasis");
  });

  it("emits all three when fully populated", () => {
    expect(
      formatBulletBody({
        description: "Wheelchair",
        meaning: "stasis",
        encoding: "immobile = blood pools",
      }),
    ).toBe("Wheelchair → stasis; immobile = blood pools");
  });

  it("emits the unusual encoding-without-meaning shape verbatim", () => {
    expect(
      formatBulletBody({ description: "Wheelchair", meaning: null, encoding: "context note" }),
    ).toBe("Wheelchair → ; context note");
  });

  it("does not trim user whitespace inside fields", () => {
    expect(
      formatBulletBody({ description: "Foo ", meaning: "bar", encoding: null }),
    ).toBe("Foo  → bar");
  });

  it("emits empty string when description is empty and other fields empty", () => {
    expect(formatBulletBody({ description: "", meaning: null, encoding: null })).toBe("");
  });
});

describe("updateBulletParts", () => {
  const UUID_A = "11111111-1111-4111-8111-111111111111";
  const UUID_B = "22222222-2222-4222-8222-222222222222";

  it("rewrites a single bullet's body without touching surrounding lines", () => {
    const notes = [
      "## Stasis",
      "",
      `* {sym:${UUID_A}} old desc → old meaning; old why`,
      `* {sym:${UUID_B}} other`,
      "",
    ].join("\n");
    const parsed = parseNotes(notes);
    const factId = parsed.factsById.keys().next().value as string;
    const result = updateBulletParts(notes, parsed, factId, UUID_A, {
      description: "Wheelchair",
      meaning: "stasis",
      encoding: "immobile = blood pools",
    });
    expect(result.ok).toBe(true);
    expect(result.newNotes).toContain(
      `* {sym:${UUID_A}} Wheelchair → stasis; immobile = blood pools`,
    );
    expect(result.newNotes).toContain(`* {sym:${UUID_B}} other`);
  });

  it("only rewrites the bullet under the specified Fact when symbol is multi-tagged", () => {
    const notes = [
      "## A",
      `* {sym:${UUID_A}} desc-A → meaning-A`,
      "## B",
      `* {sym:${UUID_A}} desc-B → meaning-B`,
      "",
    ].join("\n");
    const parsed = parseNotes(notes);
    const factIds = parsed.factsBySymbolId.get(UUID_A) ?? [];
    expect(factIds.length).toBe(2);
    const factA = factIds[0];
    const result = updateBulletParts(notes, parsed, factA, UUID_A, {
      description: "NEW",
      meaning: "stasis",
      encoding: null,
    });
    expect(result.ok).toBe(true);
    expect(result.newNotes).toContain(`* {sym:${UUID_A}} NEW → stasis`);
    expect(result.newNotes).toContain(`* {sym:${UUID_A}} desc-B → meaning-B`);
  });

  it("preserves a sibling sym-token on the same line when editing the first token's body", () => {
    const notes = [
      "## Combo",
      `* {sym:${UUID_A}} first body{sym:${UUID_B}} second body`,
      "",
    ].join("\n");
    const parsed = parseNotes(notes);
    const factId = parsed.factsById.keys().next().value as string;
    const result = updateBulletParts(notes, parsed, factId, UUID_A, {
      description: "REPLACED",
      meaning: null,
      encoding: null,
    });
    expect(result.ok).toBe(true);
    expect(result.newNotes).toContain(
      `* {sym:${UUID_A}} REPLACED{sym:${UUID_B}} second body`,
    );
  });

  it("strips a continuation line when rewriting", () => {
    const notes = [
      "## F",
      `* {sym:${UUID_A}} desc → meaning`,
      "  continuation line",
      "",
    ].join("\n");
    const parsed = parseNotes(notes);
    const factId = parsed.factsById.keys().next().value as string;
    const result = updateBulletParts(notes, parsed, factId, UUID_A, {
      description: "clean",
      meaning: null,
      encoding: null,
    });
    expect(result.ok).toBe(true);
    expect(result.newNotes).toContain(`* {sym:${UUID_A}} clean\n`);
    expect(result.newNotes).not.toContain("continuation line");
  });

  it("returns ok:false when the symbol/fact pair is not found", () => {
    const notes = `## F\n* {sym:${UUID_A}} desc\n`;
    const parsed = parseNotes(notes);
    const factId = parsed.factsById.keys().next().value as string;
    const result = updateBulletParts(notes, parsed, factId, UUID_B, {
      description: "x",
      meaning: null,
      encoding: null,
    });
    expect(result.ok).toBe(false);
    expect(result.newNotes).toBe(notes);
  });

  it("emits a token-only line (no trailing whitespace) when all fields are empty", () => {
    const notes = `## F\n* {sym:${UUID_A}} old → meaning; why\n`;
    const parsed = parseNotes(notes);
    const factId = parsed.factsById.keys().next().value as string;
    const result = updateBulletParts(notes, parsed, factId, UUID_A, {
      description: "",
      meaning: null,
      encoding: null,
    });
    expect(result.ok).toBe(true);
    expect(result.newNotes).toContain(`* {sym:${UUID_A}}\n`);
  });
});
