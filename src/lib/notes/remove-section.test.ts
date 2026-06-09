import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { removeSection } from "./remove-section";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const R = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function sectionId(notes: string, name: string): string {
  const parsed = parseNotes(notes);
  const section = parsed.sections.find((s) => s.name === name);
  if (!section) throw new Error(`no section named ${name}`);
  return section.sectionId;
}

describe("removeSection", () => {
  it("removes a section and all its facts, keeping the next section", () => {
    const notes = [
      "# S1",
      "## A",
      `* {sym:${A}} a`,
      "# S2",
      "## B",
      `* {sym:${B}} b`,
      "",
    ].join("\n");
    const out = removeSection(notes, parseNotes(notes), sectionId(notes, "S1"));
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(
      ["# S2", "## B", `* {sym:${B}} b`, ""].join("\n"),
    );
  });

  it("removes the last section without leaving a trailing blank line", () => {
    const notes = [
      "# S1",
      "## A",
      `* {sym:${A}} a`,
      "# S2",
      "## B",
      `* {sym:${B}} b`,
      "",
      "",
    ].join("\n");
    const out = removeSection(notes, parseNotes(notes), sectionId(notes, "S2"));
    expect(out.newNotes).toBe(
      ["# S1", "## A", `* {sym:${A}} a`, ""].join("\n"),
    );
  });

  it("keeps root facts that precede the section", () => {
    const notes = [
      "## R",
      `* {sym:${R}} r`,
      "# S1",
      "## A",
      `* {sym:${A}} a`,
      "",
    ].join("\n");
    const out = removeSection(notes, parseNotes(notes), sectionId(notes, "S1"));
    expect(out.newNotes).toBe(["## R", `* {sym:${R}} r`, ""].join("\n"));
  });

  it("removes an empty section (no facts)", () => {
    const notes = ["# S1", "# S2", "## B", `* {sym:${B}} b`, ""].join("\n");
    const out = removeSection(notes, parseNotes(notes), sectionId(notes, "S1"));
    expect(out.newNotes).toBe(["# S2", "## B", `* {sym:${B}} b`, ""].join("\n"));
  });

  it("returns ok:false and unchanged notes for an unknown sectionId", () => {
    const notes = `# S1\n## A\n* {sym:${A}} a\n`;
    const out = removeSection(notes, parseNotes(notes), "sec:nope#0");
    expect(out.ok).toBe(false);
    expect(out.newNotes).toBe(notes);
  });
});
