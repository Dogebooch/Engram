import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { removeBulletFromFact } from "./remove-bullet-from-fact";

const X = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function factId(notes: string, name: string): string {
  const parsed = parseNotes(notes);
  const fact = [...parsed.factsById.values()].find((f) => f.name === name);
  if (!fact) throw new Error(`no fact named ${name}`);
  return fact.factId;
}

describe("removeBulletFromFact", () => {
  it("removes one symbol's bullet, leaving sibling bullets", () => {
    const notes = ["## A", `* {sym:${X}} ax`, `* {sym:${Y}} ay`, ""].join("\n");
    const out = removeBulletFromFact(
      notes,
      parseNotes(notes),
      factId(notes, "A"),
      X,
    );
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(["## A", `* {sym:${Y}} ay`, ""].join("\n"));
  });

  it("untags from one fact only for a multi-tagged symbol", () => {
    const notes = [
      "## A",
      `* {sym:${X}} ax`,
      "## B",
      `* {sym:${X}} bx`,
      "",
    ].join("\n");
    const out = removeBulletFromFact(
      notes,
      parseNotes(notes),
      factId(notes, "A"),
      X,
    );
    expect(out.newNotes).toBe(["## A", "## B", `* {sym:${X}} bx`, ""].join("\n"));
  });

  it("matches the symbol id case-insensitively", () => {
    const notes = `## A\n* {sym:${X.toUpperCase()}} ax\n`;
    const out = removeBulletFromFact(
      notes,
      parseNotes(notes),
      factId(notes, "A"),
      X,
    );
    expect(out.newNotes).toBe("## A\n");
  });

  it("returns ok:false when the symbol is not in that fact", () => {
    const notes = `## A\n* {sym:${X}} ax\n`;
    const out = removeBulletFromFact(
      notes,
      parseNotes(notes),
      factId(notes, "A"),
      Y,
    );
    expect(out.ok).toBe(false);
    expect(out.newNotes).toBe(notes);
  });

  it("returns ok:false for an unknown factId", () => {
    const notes = `## A\n* {sym:${X}} ax\n`;
    const out = removeBulletFromFact(notes, parseNotes(notes), "_::nope#0", X);
    expect(out.ok).toBe(false);
    expect(out.newNotes).toBe(notes);
  });
});
