import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { CANVAS_SCHEMA_VERSION } from "@/lib/constants";
import { buildBundleZip } from "./bundle";
import { BundleImportError, importBundle } from "./import";
import { emptyCanvas, type CanvasState } from "@/lib/types/canvas";
import type { Picmonic } from "@/lib/types/picmonic";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function makeSourcePicmonic(overrides: Partial<Picmonic> = {}): Picmonic {
  const canvas: CanvasState = {
    ...emptyCanvas(),
    symbols: [
      {
        id: UUID_A,
        ref: "openmoji:1F600",
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        rotation: 0,
        layerIndex: 0,
        groupId: null,
        animation: null,
        animationDelay: null,
        animationDuration: null,
      },
    ],
    factHotspots: {
      "section::fact#0": { x: 500, y: 300, userOverride: true },
    },
  };
  return {
    id: "source-id-1234",
    meta: {
      name: "Source Picmonic",
      tags: ["test", "imported"],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_500,
    },
    notes: `# Section\n## Fact\n* {sym:${UUID_A}} description -> meaning; encoding\n`,
    canvas,
    ...overrides,
  };
}

async function buildAndBlob(p: Picmonic): Promise<ArrayBuffer> {
  // buildBundleZip emits a Blob; convert to ArrayBuffer so JSZip.loadAsync
  // works reliably in the node test environment.
  const blob = await buildBundleZip({ picmonic: p, pngBlob: null });
  return await blob.arrayBuffer();
}

async function makeMalformedZip(parts: Record<string, string | null>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const folder = zip.folder("malformed") ?? zip;
  for (const [name, content] of Object.entries(parts)) {
    if (content !== null) folder.file(name, content);
  }
  return await zip.generateAsync({ type: "arraybuffer" });
}

describe("importBundle round-trip", () => {
  it("imports a freshly-built bundle and preserves notes / canvas / tags / createdAt", async () => {
    const source = makeSourcePicmonic();
    const blob = await buildAndBlob(source);
    const imported = await importBundle(blob);

    expect(imported.id).not.toBe(source.id); // regenerated
    expect(imported.meta.name).toBe(source.meta.name);
    expect(imported.meta.tags).toEqual(source.meta.tags);
    expect(imported.meta.createdAt).toBe(source.meta.createdAt);
    expect(imported.meta.updatedAt).toBeGreaterThanOrEqual(source.meta.updatedAt);
    expect(imported.notes).toBe(source.notes);
    expect(imported.canvas.symbols).toEqual(source.canvas.symbols);
    expect(imported.canvas.factHotspots).toEqual(source.canvas.factHotspots);
  });

  it("regenerates root id (UUID v4 shape)", async () => {
    const source = makeSourcePicmonic();
    const imported = await importBundle(await buildAndBlob(source));
    const v4Re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(imported.id).toMatch(v4Re);
  });
});

describe("importBundle errors", () => {
  it("throws missing-file when canvas.json is absent", async () => {
    const blob = await makeMalformedZip({
      "notes.md": "## Fact\n",
      "canvas.json": null,
      "meta.json": JSON.stringify({ schemaVersion: 1, name: "x", tags: [], createdAt: 0, updatedAt: 0 }),
    });
    await expect(importBundle(blob)).rejects.toMatchObject({
      name: "BundleImportError",
      reason: "missing-file",
    });
  });

  it("throws missing-file when notes.md is absent", async () => {
    const blob = await makeMalformedZip({
      "notes.md": null,
      "canvas.json": JSON.stringify({ ...emptyCanvas() }),
      "meta.json": JSON.stringify({ schemaVersion: 1, name: "x", tags: [], createdAt: 0, updatedAt: 0 }),
    });
    await expect(importBundle(blob)).rejects.toMatchObject({
      reason: "missing-file",
    });
  });

  it("throws schema-mismatch when canvas.schemaVersion is not the current version", async () => {
    const badCanvas = { ...emptyCanvas(), schemaVersion: 999 as unknown as typeof CANVAS_SCHEMA_VERSION };
    const blob = await makeMalformedZip({
      "notes.md": "## Fact\n",
      "canvas.json": JSON.stringify(badCanvas),
      "meta.json": JSON.stringify({ schemaVersion: 999, name: "x", tags: [], createdAt: 0, updatedAt: 0 }),
    });
    await expect(importBundle(blob)).rejects.toMatchObject({
      reason: "schema-mismatch",
    });
  });

  it("throws invalid-json on malformed canvas.json", async () => {
    const blob = await makeMalformedZip({
      "notes.md": "## Fact\n",
      "canvas.json": "{ this is not json",
      "meta.json": JSON.stringify({ schemaVersion: 1, name: "x", tags: [], createdAt: 0, updatedAt: 0 }),
    });
    await expect(importBundle(blob)).rejects.toMatchObject({
      reason: "invalid-json",
    });
  });

  it("throws invalid-uuid when a symbol.id isn't a UUID", async () => {
    const badCanvas: CanvasState = {
      ...emptyCanvas(),
      symbols: [
        {
          id: "not-a-uuid",
          ref: "openmoji:1F600",
          x: 0, y: 0, width: 100, height: 100, rotation: 0, layerIndex: 0,
          groupId: null, animation: null, animationDelay: null, animationDuration: null,
        },
      ],
    };
    const blob = await makeMalformedZip({
      "notes.md": "## Fact\n",
      "canvas.json": JSON.stringify(badCanvas),
      "meta.json": JSON.stringify({ schemaVersion: 1, name: "x", tags: [], createdAt: 0, updatedAt: 0 }),
    });
    await expect(importBundle(blob)).rejects.toMatchObject({
      reason: "invalid-uuid",
    });
  });

  it("throws invalid-zip on a non-zip blob", async () => {
    const garbage = new Blob(["not a zip"], { type: "application/zip" });
    await expect(importBundle(garbage)).rejects.toMatchObject({
      reason: "invalid-zip",
    });
  });
});

describe("importBundle reconciliation", () => {
  it("drops orphan factHotspots (factId not in re-parsed notes) and warns", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sourceCanvas: CanvasState = {
        ...emptyCanvas(),
        symbols: [
          {
            id: UUID_A,
            ref: "openmoji:1F600",
            x: 0, y: 0, width: 100, height: 100, rotation: 0, layerIndex: 0,
            groupId: null, animation: null, animationDelay: null, animationDuration: null,
          },
        ],
        factHotspots: {
          // Real (matches "Section / Fact" in notes below):
          "section::fact#0": { x: 100, y: 100, userOverride: true },
          // Orphan:
          "ghost::doesnotexist#0": { x: 999, y: 999, userOverride: true },
        },
      };
      const blob = await makeMalformedZip({
        "notes.md": `# Section\n## Fact\n* {sym:${UUID_A}} desc\n`,
        "canvas.json": JSON.stringify(sourceCanvas),
        "meta.json": JSON.stringify({ schemaVersion: 1, name: "x", tags: [], createdAt: 0, updatedAt: 0 }),
      });
      const imported = await importBundle(blob);
      const keys = Object.keys(imported.canvas.factHotspots);
      expect(keys).toEqual(["section::fact#0"]);
      expect(warnSpy).toHaveBeenCalled();
      const calls = warnSpy.mock.calls.flatMap((args) => args.join(" "));
      expect(calls.some((s) => /orphan factHotspot/.test(s))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("warns (not errors) on {sym:UUID} references missing from canvas", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sourceCanvas: CanvasState = {
        ...emptyCanvas(),
        symbols: [
          {
            id: UUID_A,
            ref: "openmoji:1F600",
            x: 0, y: 0, width: 100, height: 100, rotation: 0, layerIndex: 0,
            groupId: null, animation: null, animationDelay: null, animationDuration: null,
          },
        ],
      };
      // Notes reference UUID_B which is NOT in canvas — should warn.
      const blob = await makeMalformedZip({
        "notes.md": `## Fact\n* {sym:${UUID_A}} a\n* {sym:${UUID_B}} ghost\n`,
        "canvas.json": JSON.stringify(sourceCanvas),
        "meta.json": JSON.stringify({ schemaVersion: 1, name: "x", tags: [], createdAt: 0, updatedAt: 0 }),
      });
      const imported = await importBundle(blob);
      expect(imported.canvas.symbols).toHaveLength(1);
      const calls = warnSpy.mock.calls.flatMap((args) => args.join(" "));
      expect(calls.some((s) => /sym:UUID/.test(s))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("BundleImportError exposes typed reason", async () => {
    try {
      await importBundle(new Blob(["x"], { type: "application/zip" }));
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BundleImportError);
      expect((err as BundleImportError).reason).toBe("invalid-zip");
    }
  });
});
