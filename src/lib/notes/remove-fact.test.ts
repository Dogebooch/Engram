import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { removeFact } from "./remove-fact";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const X = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function factId(notes: string, name: string): string {
  const parsed = parseNotes(notes);
  const fact = [...parsed.factsById.values()].find((f) => f.name === name);
  if (!fact) throw new Error(`no fact named ${name}`);
  return fact.factId;
}

describe("removeFact", () => {
  it("removes a middle fact, leaving neighbours intact", () => {
    const notes = [
      "## A",
      `* {sym:${A}} a`,
      "## B",
      `* {sym:${B}} b`,
      "## C",
      `* {sym:${C}} c`,
      "",
    ].join("\n");
    const out = removeFact(notes, parseNotes(notes), factId(notes, "B"));
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(
      ["## A", `* {sym:${A}} a`, "## C", `* {sym:${C}} c`, ""].join("\n"),
    );
  });

  it("removes the last fact in the doc without leaving a trailing blank line", () => {
    const notes = [
      "## A",
      `* {sym:${A}} a`,
      "",
      "## B",
      `* {sym:${B}} b`,
      "",
      "",
    ].join("\n");
    const out = removeFact(notes, parseNotes(notes), factId(notes, "B"));
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(["## A", `* {sym:${A}} a`, ""].join("\n"));
  });

  it("removes the only fact, leaving an empty doc", () => {
    const notes = `## A\n* {sym:${A}} a\n`;
    const out = removeFact(notes, parseNotes(notes), factId(notes, "A"));
    expect(out.newNotes).toBe("");
  });

  it("leaves the enclosing section heading intact", () => {
    const notes = [
      "# Sec",
      "## A",
      `* {sym:${A}} a`,
      "## B",
      `* {sym:${B}} b`,
      "",
    ].join("\n");
    const out = removeFact(notes, parseNotes(notes), factId(notes, "A"));
    expect(out.newNotes).toBe(
      ["# Sec", "## B", `* {sym:${B}} b`, ""].join("\n"),
    );
  });

  it("keeps a multi-tagged symbol's bullet in the other fact", () => {
    const notes = [
      "## A",
      `* {sym:${X}} ax`,
      "## B",
      `* {sym:${X}} bx`,
      "",
    ].join("\n");
    const out = removeFact(notes, parseNotes(notes), factId(notes, "A"));
    expect(out.newNotes).toBe(["## B", `* {sym:${X}} bx`, ""].join("\n"));
  });

  it("removes an empty fact (heading only)", () => {
    const notes = ["## A", "## B", `* {sym:${B}} b`, ""].join("\n");
    const out = removeFact(notes, parseNotes(notes), factId(notes, "A"));
    expect(out.newNotes).toBe(["## B", `* {sym:${B}} b`, ""].join("\n"));
  });

  it("returns ok:false and unchanged notes for an unknown factId", () => {
    const notes = `## A\n* {sym:${A}} a\n`;
    const out = removeFact(notes, parseNotes(notes), "_::nope#0");
    expect(out.ok).toBe(false);
    expect(out.newNotes).toBe(notes);
  });
});
