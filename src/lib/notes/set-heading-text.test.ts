import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { setHeadingText } from "./set-heading-text";

describe("setHeadingText", () => {
  it("renames a fact, preserving its ## marker and body", () => {
    const notes = "## Old\n* x\n";
    const fact = [...parseNotes(notes).factsById.values()][0];
    const out = setHeadingText(notes, fact.headingFrom, fact.headingTo, 2, "New");
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe("## New\n* x\n");
  });

  it("renames a section, preserving its # marker", () => {
    const notes = "# Old sec\n## A\n";
    const section = parseNotes(notes).sections[0];
    const out = setHeadingText(
      notes,
      section.headingFrom,
      section.headingTo,
      1,
      "New sec",
    );
    expect(out.newNotes).toBe("# New sec\n## A\n");
  });

  it("trims surrounding whitespace from the new name", () => {
    const notes = "## Old\n";
    const fact = [...parseNotes(notes).factsById.values()][0];
    const out = setHeadingText(notes, fact.headingFrom, fact.headingTo, 2, "  New  ");
    expect(out.newNotes).toBe("## New\n");
  });

  it("rejects a blank name (ok:false, unchanged)", () => {
    const notes = "## Old\n";
    const fact = [...parseNotes(notes).factsById.values()][0];
    const out = setHeadingText(notes, fact.headingFrom, fact.headingTo, 2, "   ");
    expect(out.ok).toBe(false);
    expect(out.newNotes).toBe(notes);
  });
});
