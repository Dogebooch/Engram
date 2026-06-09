import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { moveFact } from "./move-fact";

const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const c = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function fid(notes: string, name: string): string {
  const f = [...parseNotes(notes).factsById.values()].find((x) => x.name === name);
  if (!f) throw new Error(`no fact ${name}`);
  return f.factId;
}
function sid(notes: string, name: string): string {
  const s = parseNotes(notes).sections.find((x) => x.name === name);
  if (!s) throw new Error(`no section ${name}`);
  return s.sectionId;
}

describe("moveFact", () => {
  it("reorders root facts (before-fact)", () => {
    const notes = ["## A", `* {sym:${a}} a`, "## B", `* {sym:${b}} b`, "## C", `* {sym:${c}} c`, ""].join("\n");
    const out = moveFact(notes, parseNotes(notes), fid(notes, "C"), { type: "before-fact", factId: fid(notes, "A") });
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(
      ["## C", `* {sym:${c}} c`, "## A", `* {sym:${a}} a`, "## B", `* {sym:${b}} b`, ""].join("\n"),
    );
  });

  it("appends a fact to the end of another section (section-end)", () => {
    const notes = ["# S1", "## A", `* {sym:${a}} a`, "# S2", "## B", `* {sym:${b}} b`, ""].join("\n");
    const out = moveFact(notes, parseNotes(notes), fid(notes, "A"), { type: "section-end", sectionId: sid(notes, "S2") });
    expect(out.newNotes).toBe(
      ["# S1", "# S2", "## B", `* {sym:${b}} b`, "## A", `* {sym:${a}} a`, ""].join("\n"),
    );
  });

  it("moves a fact into an empty section", () => {
    const notes = ["# S1", "# S2", "## B", `* {sym:${b}} b`, ""].join("\n");
    const out = moveFact(notes, parseNotes(notes), fid(notes, "B"), { type: "section-end", sectionId: sid(notes, "S1") });
    expect(out.newNotes).toBe(["# S1", "## B", `* {sym:${b}} b`, "", "# S2", ""].join("\n"));
  });

  it("moves a section fact down to the root region (null section-end)", () => {
    const notes = ["## R", `* {sym:${c}} r`, "# S1", "## A", `* {sym:${a}} a`, ""].join("\n");
    const out = moveFact(notes, parseNotes(notes), fid(notes, "A"), { type: "section-end", sectionId: null });
    expect(out.newNotes).toBe(
      ["## R", `* {sym:${c}} r`, "## A", `* {sym:${a}} a`, "# S1", ""].join("\n"),
    );
  });

  it("is a no-op when dropping a fact before itself", () => {
    const notes = ["## A", `* {sym:${a}} a`, ""].join("\n");
    const out = moveFact(notes, parseNotes(notes), fid(notes, "A"), { type: "before-fact", factId: fid(notes, "A") });
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(notes);
  });

  it("returns ok:false for an unknown fact", () => {
    const notes = "## A\n";
    const out = moveFact(notes, parseNotes(notes), "_::nope#0", { type: "section-end", sectionId: null });
    expect(out.ok).toBe(false);
  });
});
