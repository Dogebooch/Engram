import { describe, expect, it } from "vitest";
import { insertHeadingText } from "./insert-heading";
import { parseNotes } from "./parse";

describe("insertHeadingText", () => {
  it("inserts a named fact into an empty doc", () => {
    const out = insertHeadingText("", 0, 2, "New fact");
    expect(out.newNotes).toBe("## New fact\n");
    expect(out.headingFrom).toBe(0);
    expect(out.anchor).toBe(3);
    const parsed = parseNotes(out.newNotes);
    const fact = [...parsed.factsById.values()][0];
    expect(fact.name).toBe("New fact");
    expect(fact.headingFrom).toBe(out.headingFrom);
  });

  it("appends after a trailing newline (line start)", () => {
    const out = insertHeadingText("# S\n", 4, 2, "New fact");
    expect(out.newNotes).toBe("# S\n## New fact\n");
    expect(out.headingFrom).toBe(4);
    expect(out.anchor).toBe(7);
  });

  it("prepends a newline when not at a line start", () => {
    const out = insertHeadingText("# S", 3, 2, "New fact");
    expect(out.newNotes).toBe("# S\n## New fact");
    expect(out.headingFrom).toBe(4);
    expect(out.anchor).toBe(7);
  });

  it("inserts a level-1 section", () => {
    const out = insertHeadingText("", 0, 1, "Sec");
    expect(out.newNotes).toBe("# Sec\n");
    expect(out.anchor).toBe(2);
  });

  it("supports an empty name (caret-driven CodeMirror widget use)", () => {
    const out = insertHeadingText("", 0, 2, "");
    expect(out.newNotes).toBe("## \n");
    expect(out.anchor).toBe(3);
  });
});
