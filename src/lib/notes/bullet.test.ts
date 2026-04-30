import { describe, expect, it } from "vitest";
import { parseBullet } from "./bullet";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("parseBullet", () => {
  it("full format: description → meaning; encoding", () => {
    const r = parseBullet(
      `* {sym:${UUID}} red wheel → vascular injury; rhymes with weal`,
    );
    expect(r.description).toBe("red wheel");
    expect(r.meaning).toBe("vascular injury");
    expect(r.encoding).toBe("rhymes with weal");
  });

  it("no encoding: description → meaning", () => {
    const r = parseBullet(`* {sym:${UUID}} red wheel → vascular injury`);
    expect(r.description).toBe("red wheel");
    expect(r.meaning).toBe("vascular injury");
    expect(r.encoding).toBeNull();
  });

  it("no arrow: only description", () => {
    const r = parseBullet(`* {sym:${UUID}} just a freeform note`);
    expect(r.description).toBe("just a freeform note");
    expect(r.meaning).toBeNull();
    expect(r.encoding).toBeNull();
  });

  it("dash bullet marker", () => {
    const r = parseBullet(`- {sym:${UUID}} red wheel → meaning`);
    expect(r.description).toBe("red wheel");
    expect(r.meaning).toBe("meaning");
  });

  it("plus bullet marker", () => {
    const r = parseBullet(`+ {sym:${UUID}} desc`);
    expect(r.description).toBe("desc");
  });

  it("ASCII arrow `->` works as separator", () => {
    const r = parseBullet(`* {sym:${UUID}} red wheel -> vascular injury; rationale`);
    expect(r.description).toBe("red wheel");
    expect(r.meaning).toBe("vascular injury");
    expect(r.encoding).toBe("rationale");
  });

  it("multiple arrows: only first splits", () => {
    const r = parseBullet(`* {sym:${UUID}} a → b → c; d`);
    expect(r.description).toBe("a");
    expect(r.meaning).toBe("b → c");
    expect(r.encoding).toBe("d");
  });

  it("multiple semicolons after arrow: only first splits", () => {
    const r = parseBullet(`* {sym:${UUID}} a → b; c; d`);
    expect(r.description).toBe("a");
    expect(r.meaning).toBe("b");
    expect(r.encoding).toBe("c; d");
  });

  it("trims whitespace around all parts", () => {
    const r = parseBullet(
      `*   {sym:${UUID}}   red wheel   →   vascular injury   ;   rhymes   `,
    );
    expect(r.description).toBe("red wheel");
    expect(r.meaning).toBe("vascular injury");
    expect(r.encoding).toBe("rhymes");
  });

  it("empty meaning after arrow → null meaning", () => {
    const r = parseBullet(`* {sym:${UUID}} desc → `);
    expect(r.description).toBe("desc");
    expect(r.meaning).toBeNull();
    expect(r.encoding).toBeNull();
  });

  it("empty encoding after semicolon → null encoding", () => {
    const r = parseBullet(`* {sym:${UUID}} a → b; `);
    expect(r.description).toBe("a");
    expect(r.meaning).toBe("b");
    expect(r.encoding).toBeNull();
  });

  it("line without symbol token still parses", () => {
    const r = parseBullet(`* freeform → meaning`);
    expect(r.description).toBe("freeform");
    expect(r.meaning).toBe("meaning");
  });

  it("line without bullet marker also parses (degraded path)", () => {
    const r = parseBullet(`{sym:${UUID}} desc → meaning`);
    expect(r.description).toBe("desc");
    expect(r.meaning).toBe("meaning");
  });
});
