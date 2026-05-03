import { describe, expect, it } from "vitest";
import { lintBullet, lintNotes, type LintCode } from "./lint";
import { parseNotes } from "./parse";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function codes(issues: { code: LintCode }[]): LintCode[] {
  return issues.map((i) => i.code);
}

describe("lintBullet", () => {
  it("clean bullet returns no issues", () => {
    const issues = lintBullet(`* {sym:${UUID_A}} red wheel → vascular injury; rhymes with weal`, {
      knownSymbolIds: new Set([UUID_A]),
    });
    expect(issues).toEqual([]);
  });

  it("missing-symbol-token: no {sym:...} on the line", () => {
    const issues = lintBullet(`* freeform note → meaning; encoding`);
    expect(codes(issues)).toContain("missing-symbol-token");
  });

  it("malformed-symbol-token: not a v4 UUID", () => {
    const issues = lintBullet(`* {sym:not-a-uuid} desc → meaning; enc`);
    expect(codes(issues)).toContain("malformed-symbol-token");
  });

  it("empty-description: bullet with only the symbol token", () => {
    const issues = lintBullet(`* {sym:${UUID_A}}   `);
    expect(codes(issues)).toContain("empty-description");
  });

  it("unknown-symbol-uuid: well-formed UUID not in known set", () => {
    const issues = lintBullet(`* {sym:${UUID_B}} desc → meaning; enc`, {
      knownSymbolIds: new Set([UUID_A]),
    });
    expect(codes(issues)).toContain("unknown-symbol-uuid");
  });

  it("missing-arrow: bullet has token + description, no →", () => {
    const issues = lintBullet(`* {sym:${UUID_A}} just a description`);
    expect(codes(issues)).toContain("missing-arrow");
  });

  it("encoding-note is optional: bullet with → but no ; is clean", () => {
    const issues = lintBullet(`* {sym:${UUID_A}} desc → meaning only`);
    expect(codes(issues)).not.toContain("missing-arrow");
    expect(issues).toHaveLength(0);
  });

  it("severities: errors vs warnings map per pipeline schema", () => {
    const malformed = lintBullet(`* {sym:not-a-uuid} desc`).find(
      (i) => i.code === "malformed-symbol-token",
    );
    const emptyDesc = lintBullet(`* {sym:${UUID_A}}   `).find(
      (i) => i.code === "empty-description",
    );
    const missingArrow = lintBullet(`* {sym:${UUID_A}} desc`, {
      knownSymbolIds: new Set([UUID_A]),
    }).find((i) => i.code === "missing-arrow");
    expect(malformed?.severity).toBe("error");
    expect(emptyDesc?.severity).toBe("error");
    expect(missingArrow?.severity).toBe("warning");
  });

  it("lineOffset translates to absolute document offsets", () => {
    const issues = lintBullet(`* freeform`, { lineOffset: 100 });
    const m = issues.find((i) => i.code === "missing-symbol-token")!;
    expect(m.from).toBe(100);
    expect(m.to).toBe(100 + "* freeform".length);
  });
});

describe("lintNotes", () => {
  it("aggregates per-line issues + emits untagged-symbol for orphan canvas symbols", () => {
    const notes = [
      "## Mechanism",
      "",
      `* {sym:${UUID_A}} red wheel → vascular injury; rhymes with weal`,
      `* freeform without a token`,
      "",
    ].join("\n");

    const parsed = parseNotes(notes);
    const known = new Set([UUID_A, UUID_B]);
    const issues = lintNotes(notes, parsed, known);
    const all = codes(issues);

    expect(all).toContain("missing-symbol-token");
    expect(all).toContain("untagged-symbol");

    const untagged = issues.find((i) => i.code === "untagged-symbol")!;
    expect(untagged.message).toContain(UUID_B);
  });

  it("ignores non-bullet lines outside Fact bodies", () => {
    const notes = "Some prose with no headings and no bullets.\n";
    const parsed = parseNotes(notes);
    const issues = lintNotes(notes, parsed, new Set());
    expect(issues).toEqual([]);
  });
});
