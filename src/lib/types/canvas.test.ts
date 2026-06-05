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

  it("normalizes legacy symbols as image layers", () => {
    const legacySymbol = {
      id: "11111111-1111-4111-8111-111111111111",
      ref: "openmoji:1F600",
      x: 100,
      y: 120,
      width: 80,
      height: 80,
      rotation: 0,
      layerIndex: 0,
      groupId: null,
      animation: null,
      animationDelay: null,
      animationDuration: null,
    };
    const c = {
      ...emptyCanvas(),
      symbols: [legacySymbol],
    } as unknown as CanvasState;

    const out = normalizeCanvas(c);

    expect(out).not.toBe(c);
    expect(out.symbols[0]).toMatchObject({
      id: legacySymbol.id,
      kind: "image",
      ref: "openmoji:1F600",
    });
  });

  it("normalizes region layers to geometry-only refs", () => {
    const regionSymbol = {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "region",
      ref: "legacy-ref",
      x: 10,
      y: 20,
      width: 120,
      height: 90,
      rotation: 0,
      layerIndex: 0,
      groupId: null,
      animation: null,
      animationDelay: null,
      animationDuration: null,
    };
    const c = {
      ...emptyCanvas(),
      symbols: [regionSymbol],
    } as unknown as CanvasState;

    const out = normalizeCanvas(c);

    expect(out.symbols[0]).toMatchObject({
      kind: "region",
      ref: null,
      shape: "rect",
      x: 10,
      y: 20,
      width: 120,
      height: 90,
    });
  });

  it("preserves valid polygon region points", () => {
    const regionSymbol = {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "region",
      ref: null,
      shape: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 80, y: 10 },
        { x: 20, y: 60 },
      ],
      x: 10,
      y: 20,
      width: 80,
      height: 60,
      rotation: 0,
      layerIndex: 0,
      groupId: null,
      animation: null,
      animationDelay: null,
      animationDuration: null,
    };
    const c = {
      ...emptyCanvas(),
      symbols: [regionSymbol],
    } as unknown as CanvasState;

    const out = normalizeCanvas(c);

    expect(out.symbols[0]).toMatchObject({
      kind: "region",
      ref: null,
      shape: "polygon",
      points: regionSymbol.points,
    });
  });

  it("preserves valid extraOutlines on a polygon region", () => {
    const ring = {
      x: 30,
      y: 40,
      width: 20,
      height: 20,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8 },
      ],
    };
    const c = {
      ...emptyCanvas(),
      symbols: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          kind: "region",
          ref: null,
          shape: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 80, y: 10 },
            { x: 20, y: 60 },
          ],
          extraOutlines: [ring],
          x: 10,
          y: 20,
          width: 80,
          height: 60,
          rotation: 0,
          layerIndex: 0,
          groupId: null,
          animation: null,
          animationDelay: null,
          animationDuration: null,
        },
      ],
    } as unknown as CanvasState;

    const out = normalizeCanvas(c);
    const layer = out.symbols[0] as { extraOutlines?: unknown[] };
    expect(layer.extraOutlines).toEqual([ring]);
  });

  it("drops malformed extra rings and omits the field when none remain", () => {
    const c = {
      ...emptyCanvas(),
      symbols: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          kind: "region",
          ref: null,
          shape: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 80, y: 10 },
            { x: 20, y: 60 },
          ],
          // Too few points → invalid → dropped.
          extraOutlines: [
            { x: 1, y: 2, width: 5, height: 5, points: [{ x: 0, y: 0 }] },
          ],
          x: 10,
          y: 20,
          width: 80,
          height: 60,
          rotation: 0,
          layerIndex: 0,
          groupId: null,
          animation: null,
          animationDelay: null,
          animationDuration: null,
        },
      ],
    } as unknown as CanvasState;

    const out = normalizeCanvas(c);
    expect(out.symbols[0]).not.toHaveProperty("extraOutlines");
  });

  it("falls malformed polygon regions back to rect", () => {
    const regionSymbol = {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "region",
      ref: null,
      shape: "polygon",
      points: [{ x: 0, y: 0 }, { x: 80, y: 10 }],
      x: 10,
      y: 20,
      width: 80,
      height: 60,
      rotation: 0,
      layerIndex: 0,
      groupId: null,
      animation: null,
      animationDelay: null,
      animationDuration: null,
    };
    const c = {
      ...emptyCanvas(),
      symbols: [regionSymbol],
    } as unknown as CanvasState;

    const out = normalizeCanvas(c);

    expect(out.symbols[0]).toMatchObject({
      kind: "region",
      shape: "rect",
      points: undefined,
    });
  });
});
