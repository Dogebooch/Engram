import { describe, expect, it } from "vitest";
import {
  emptyBackdrop,
  emptyCanvas,
  normalizeCanvas,
  type Backdrop,
  type CanvasState,
} from "./canvas";

describe("emptyBackdrop", () => {
  it("defaults opacity to 1 and blob/ref to null", () => {
    const bd = emptyBackdrop();
    expect(bd).toEqual({ ref: null, uploadedBlobId: null, opacity: 1 });
  });
});

describe("normalizeCanvas backdrop backfill", () => {
  it("returns the same object when fully normalized", () => {
    const c = emptyCanvas();
    expect(normalizeCanvas(c)).toBe(c);
  });

  it("backfills missing backdrop entirely", () => {
    const c = {
      ...emptyCanvas(),
      backdrop: undefined as unknown as Backdrop,
    } as CanvasState;
    const out = normalizeCanvas(c);
    expect(out).not.toBe(c);
    expect(out.backdrop).toEqual(emptyBackdrop());
  });

  it("backfills opacity on a legacy two-field backdrop", () => {
    const c: CanvasState = {
      ...emptyCanvas(),
      backdrop: {
        ref: null,
        uploadedBlobId: "abc",
      } as unknown as Backdrop,
    };
    const out = normalizeCanvas(c);
    expect(out.backdrop.opacity).toBe(1);
    expect(out.backdrop.uploadedBlobId).toBe("abc");
  });

  it("preserves an existing non-default opacity", () => {
    const c: CanvasState = {
      ...emptyCanvas(),
      backdrop: { ref: null, uploadedBlobId: "abc", opacity: 0.4 },
    };
    const out = normalizeCanvas(c);
    expect(out).toBe(c);
    expect(out.backdrop.opacity).toBe(0.4);
  });

  it("backfills factMeta and timeline as before", () => {
    const c = {
      ...emptyCanvas(),
      factMeta: undefined as unknown as CanvasState["factMeta"],
      timeline: undefined as unknown as CanvasState["timeline"],
    } as CanvasState;
    const out = normalizeCanvas(c);
    expect(out.factMeta).toEqual({});
    expect(out.timeline).toEqual([]);
  });
});
