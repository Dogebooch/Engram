import { describe, expect, it } from "vitest";
import { parseNotes } from "./parse";
import { moveBulletToIndex } from "./reorder-bullet";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const X = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function fid(notes: string, name: string): string {
  const f = [...parseNotes(notes).factsById.values()].find((x) => x.name === name);
  if (!f) throw new Error(`no fact ${name}`);
  return f.factId;
}

describe("moveBulletToIndex", () => {
  const threeBullets = [
    "## F",
    `* {sym:${A}} a`,
    `* {sym:${B}} b`,
    `* {sym:${C}} c`,
    "",
  ].join("\n");

  it("reorders within a fact (insert before index)", () => {
    const out = moveBulletToIndex(threeBullets, parseNotes(threeBullets), A, fid(threeBullets, "F"), fid(threeBullets, "F"), 2);
    expect(out.ok).toBe(true);
    expect(out.newNotes).toBe(
      ["## F", `* {sym:${B}} b`, `* {sym:${A}} a`, `* {sym:${C}} c`, ""].join("\n"),
    );
  });

  it("moves a bullet to the front (index 0)", () => {
    const out = moveBulletToIndex(threeBullets, parseNotes(threeBullets), C, fid(threeBullets, "F"), fid(threeBullets, "F"), 0);
    expect(out.newNotes).toBe(
      ["## F", `* {sym:${C}} c`, `* {sym:${A}} a`, `* {sym:${B}} b`, ""].join("\n"),
    );
  });

  it("appends within a fact when toIndex >= count", () => {
    const out = moveBulletToIndex(threeBullets, parseNotes(threeBullets), A, fid(threeBullets, "F"), fid(threeBullets, "F"), 9);
    expect(out.newNotes).toBe(
      ["## F", `* {sym:${B}} b`, `* {sym:${C}} c`, `* {sym:${A}} a`, ""].join("\n"),
    );
  });

  it("moves a bullet to another fact at an index", () => {
    const notes = ["## F", `* {sym:${A}} a`, `* {sym:${B}} b`, "## G", `* {sym:${X}} x`, ""].join("\n");
    const out = moveBulletToIndex(notes, parseNotes(notes), A, fid(notes, "F"), fid(notes, "G"), 0);
    expect(out.newNotes).toBe(
      ["## F", `* {sym:${B}} b`, "## G", `* {sym:${A}} a`, `* {sym:${X}} x`, ""].join("\n"),
    );
  });

  it("appends to another (empty) fact", () => {
    const notes = ["## F", `* {sym:${A}} a`, "## G", ""].join("\n");
    const out = moveBulletToIndex(notes, parseNotes(notes), A, fid(notes, "F"), fid(notes, "G"), 0);
    expect(out.newNotes).toBe(["## F", "## G", `* {sym:${A}} a`, ""].join("\n"));
  });

  it("returns ok:false for an unknown fact", () => {
    const out = moveBulletToIndex(threeBullets, parseNotes(threeBullets), A, fid(threeBullets, "F"), "_::nope#0", 0);
    expect(out.ok).toBe(false);
    expect(out.newNotes).toBe(threeBullets);
  });
});
