import { describe, it, expect } from "vitest";
import { computePopoverAnchor } from "./describe-popover-anchor";
import { parseNotes } from "@/lib/notes/parse";
import { parseBullet, updateBulletParts } from "@/lib/notes/bullet";

describe("computePopoverAnchor", () => {
  const box = { scale: 1, offsetX: 0, offsetY: 0, width: 1000, height: 600 };
  const container = { width: 1000, height: 600 };
  const popover = { width: 300, height: 200 };

  it("sits below a region with room, centered horizontally", () => {
    const a = computePopoverAnchor(
      { x: 400, y: 100, width: 200, height: 100 },
      box,
      container,
      popover,
    );
    expect(a).toEqual({ left: 350, top: 210, side: "below" });
  });

  it("flips above when there is no room below", () => {
    const a = computePopoverAnchor(
      { x: 400, y: 480, width: 200, height: 100 },
      box,
      container,
      popover,
    );
    expect(a.side).toBe("above");
    expect(a.top).toBe(270);
  });

  it("clamps to the left edge", () => {
    const a = computePopoverAnchor(
      { x: 0, y: 100, width: 100, height: 100 },
      box,
      container,
      popover,
    );
    expect(a.left).toBe(10);
  });

  it("clamps to the right edge", () => {
    const a = computePopoverAnchor(
      { x: 950, y: 100, width: 100, height: 100 },
      box,
      container,
      popover,
    );
    expect(a.left).toBe(690); // container.width - popover.width - gap
  });

  it("applies stage scale and centered offset", () => {
    const a = computePopoverAnchor(
      { x: 200, y: 100, width: 100, height: 50 },
      { scale: 0.5, offsetX: 100, offsetY: 50, width: 960, height: 540 },
      { width: 1160, height: 640 },
      popover,
    );
    expect(a).toEqual({ left: 75, top: 135, side: "below" });
  });
});

describe("bullet read/write contract (popover commit path)", () => {
  const SYM = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const notes = `# Section\n\n## Fact A\n* {sym:${SYM}} old desc → old meaning; old why\n* {sym:${OTHER}} keep me\n`;

  it("rewrites one bullet's parts and leaves siblings untouched", () => {
    const parsed = parseNotes(notes);
    const factId = parsed.factsBySymbolId.get(SYM)?.[0];
    expect(factId).toBeTruthy();

    const result = updateBulletParts(notes, parsed, factId!, SYM, {
      description: "new desc",
      meaning: "new meaning",
      encoding: "new why",
    });
    expect(result.ok).toBe(true);
    expect(result.newNotes).toContain(
      `{sym:${SYM}} new desc → new meaning; new why`,
    );
    expect(result.newNotes).toContain(`{sym:${OTHER}} keep me`);

    const line = result.newNotes.split("\n").find((l) => l.includes(SYM))!;
    expect(parseBullet(line)).toMatchObject({
      description: "new desc",
      meaning: "new meaning",
      encoding: "new why",
    });
  });

  it("clears meaning/why when blanked but preserves the description", () => {
    const parsed = parseNotes(notes);
    const factId = parsed.factsBySymbolId.get(SYM)?.[0];
    const result = updateBulletParts(notes, parsed, factId!, SYM, {
      description: "just a description",
      meaning: null,
      encoding: null,
    });
    expect(result.ok).toBe(true);
    const line = result.newNotes.split("\n").find((l) => l.includes(SYM))!;
    expect(parseBullet(line)).toMatchObject({
      description: "just a description",
      meaning: null,
      encoding: null,
    });
  });
});
