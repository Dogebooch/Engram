import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { moveSection } from "./move-section";

const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const c = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const r = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function sid(notes: string, name: string): string {
  const s = parseNotes(notes).sections.find((x) => x.name === name);
  if (!s) throw new Error(`no section ${name}`);
  return s.sectionId;
}

describe("moveSection", () => {
  const three = [
    "# S1", "## A", `* {sym:${a}} a`,
    "# S2", "## B", `* {sym:${b}} b`,
    "# S3", "## C", `* {sym:${c}} c`,
    "",
  ].join("\n");

  it("reorders sections (before-section)", () => {
    const out = moveSection(three, parseNotes(three), sid(three, "S3"), { type: "before-section", sectionId: sid(three, "S1") });
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(
      ["# S3", "## C", `* {sym:${c}} c`, "# S1", "## A", `* {sym:${a}} a`, "# S2", "## B", `* {sym:${b}} b`, ""].join("\n"),
    );
  });

  it("moves a section to the end", () => {
    const out = moveSection(three, parseNotes(three), sid(three, "S1"), { type: "end" });
    expect(out.newNotes).toBe(
      ["# S2", "## B", `* {sym:${b}} b`, "# S3", "## C", `* {sym:${c}} c`, "# S1", "## A", `* {sym:${a}} a`, ""].join("\n"),
    );
  });

  it("leaves root facts untouched", () => {
    const notes = ["## R", `* {sym:${r}} r`, "# S1", "## A", `* {sym:${a}} a`, "# S2", "## B", `* {sym:${b}} b`, ""].join("\n");
    const out = moveSection(notes, parseNotes(notes), sid(notes, "S2"), { type: "before-section", sectionId: sid(notes, "S1") });
    expect(out.newNotes).toBe(
      ["## R", `* {sym:${r}} r`, "# S2", "## B", `* {sym:${b}} b`, "# S1", "## A", `* {sym:${a}} a`, ""].join("\n"),
    );
  });

  it("is a no-op when dropping a section before itself", () => {
    const out = moveSection(three, parseNotes(three), sid(three, "S2"), { type: "before-section", sectionId: sid(three, "S2") });
    expect(out.newNotes).toBe(three);
  });

  it("returns ok:false for an unknown section", () => {
    const out = moveSection(three, parseNotes(three), "sec:nope#0", { type: "end" });
    expect(out.ok).toBe(false);
  });
});
