import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { removeOrphanedBullets } from "./remove-bullets";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

describe("removeOrphanedBullets", () => {
  it("returns notes unchanged when symbolIds is empty", () => {
    const notes = `## Fact one\n* {sym:${UUID_A}} desc\n`;
    const parsed = parseNotes(notes);
    expect(removeOrphanedBullets(notes, parsed, new Set())).toBe(notes);
  });

  it("drops a single bullet referencing the deleted symbol", () => {
    const notes = [
      "## Fact one",
      `* {sym:${UUID_A}} alpha`,
      `* {sym:${UUID_B}} beta`,
      "",
    ].join("\n");
    const parsed = parseNotes(notes);
    const out = removeOrphanedBullets(notes, parsed, new Set([UUID_A]));
    expect(out).toBe(["## Fact one", `* {sym:${UUID_B}} beta`, ""].join("\n"));
  });

  it("drops multi-tagged symbol bullets in every Fact", () => {
    const notes = [
      "## Fact one",
      `* {sym:${UUID_A}} alpha`,
      "## Fact two",
      `* {sym:${UUID_A}} alpha-twin`,
      `* {sym:${UUID_B}} beta`,
      "",
    ].join("\n");
    const parsed = parseNotes(notes);
    const out = removeOrphanedBullets(notes, parsed, new Set([UUID_A]));
    expect(out).toBe(
      [
        "## Fact one",
        "## Fact two",
        `* {sym:${UUID_B}} beta`,
        "",
      ].join("\n"),
    );
  });

  it("is idempotent when called again with the same set", () => {
    const notes = `## Fact\n* {sym:${UUID_A}} a\n* {sym:${UUID_B}} b\n`;
    const parsed = parseNotes(notes);
    const once = removeOrphanedBullets(notes, parsed, new Set([UUID_A]));
    const twice = removeOrphanedBullets(once, parseNotes(once), new Set([UUID_A]));
    expect(twice).toBe(once);
  });

  it("ignores symbols that don't appear in notes", () => {
    const notes = `## Fact\n* {sym:${UUID_A}} a\n`;
    const parsed = parseNotes(notes);
    expect(
      removeOrphanedBullets(notes, parsed, new Set([UUID_C])),
    ).toBe(notes);
  });

  it("matches symbol ids case-insensitively", () => {
    const notes = `## Fact\n* {sym:${UUID_A.toUpperCase()}} alpha\n`;
    const parsed = parseNotes(notes);
    const out = removeOrphanedBullets(notes, parsed, new Set([UUID_A]));
    expect(out).toBe("## Fact\n");
  });
});
