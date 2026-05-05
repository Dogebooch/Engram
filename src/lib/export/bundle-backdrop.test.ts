import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clear as idbClear } from "idb-keyval";
import JSZip from "jszip";
import { emptyCanvas, type CanvasState } from "@/lib/types/canvas";
import type { Picmonic } from "@/lib/types/picmonic";
import { deleteBlob, getBlob, putBlob } from "@/lib/user-assets/blob-store";
import { __resetUserAssetStoreForTests } from "@/lib/user-assets/store";
import { __resetUserAssetsLoadForTests } from "@/lib/user-assets/load";
import { __resetSymbolsCacheForTests } from "@/lib/symbols/load";
import { buildBundleZip } from "./bundle";
import { importBundle } from "./import";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const BACKDROP_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(async () => {
  __resetUserAssetStoreForTests();
  __resetSymbolsCacheForTests();
  __resetUserAssetsLoadForTests();
  await idbClear();
  if (typeof URL.createObjectURL !== "function") {
    let n = 0;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      () => `blob:test-${++n}`;
    (URL as unknown as { revokeObjectURL: (s: string) => void }).revokeObjectURL =
      () => {};
  }
});

afterEach(async () => {
  await idbClear();
});

function makePicmonicWithBackdrop(): Picmonic {
  const canvas: CanvasState = {
    ...emptyCanvas(),
    backdrop: { ref: null, uploadedBlobId: BACKDROP_ID, opacity: 0.65 },
  };
  return {
    id: "picmonic-with-backdrop",
    meta: {
      name: "With Backdrop",
      tags: [],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_500,
    },
    notes: "## Fact\n",
    canvas,
  };
}

describe("bundle round-trip with backdrop", () => {
  it("emits a backdrop entry in manifest and restores blob on import", async () => {
    const blob = new Blob([PNG_BYTES], { type: "image/png" });
    await putBlob(BACKDROP_ID, blob);

    const picmonic = makePicmonicWithBackdrop();
    const zipBlob = await buildBundleZip({
      picmonic,
      pngBlob: null,
      backdrops: [
        { id: BACKDROP_ID, ext: "png", mimeType: "image/png", blob },
      ],
    });
    const zipBytes = await zipBlob.arrayBuffer();

    const zip = await JSZip.loadAsync(zipBytes);
    let manifestPath = "";
    let backdropPath = "";
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const norm = path.replace(/\\/g, "/");
      if (norm.endsWith("assets/manifest.json")) manifestPath = norm;
      if (norm.endsWith(`assets/${BACKDROP_ID}.png`)) backdropPath = norm;
    });
    expect(manifestPath).not.toBe("");
    expect(backdropPath).not.toBe("");

    const manifest = JSON.parse(await zip.file(manifestPath)!.async("string"));
    expect(manifest.version).toBe(2);
    expect(manifest.backdrops).toEqual([
      { id: BACKDROP_ID, ext: "png", mimeType: "image/png" },
    ]);

    // Wipe IDB then re-import.
    __resetUserAssetStoreForTests();
    await idbClear();
    await deleteBlob(BACKDROP_ID);
    expect(await getBlob(BACKDROP_ID)).toBeUndefined();

    const imported = await importBundle(zipBytes);
    expect(imported.canvas.backdrop.uploadedBlobId).toBe(BACKDROP_ID);
    expect(imported.canvas.backdrop.opacity).toBe(0.65);
    // Backdrop blob was restored to IDB.
    expect(await getBlob(BACKDROP_ID)).toBeDefined();
  });

  it("normalizes a legacy bundle whose backdrop lacks opacity", async () => {
    // Simulate a bundle exported before the opacity field existed.
    const canvas = {
      ...emptyCanvas(),
      backdrop: { ref: null, uploadedBlobId: null },
    } as unknown as CanvasState;
    const picmonic: Picmonic = {
      id: "legacy",
      meta: {
        name: "Legacy",
        tags: [],
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_500,
      },
      notes: "",
      canvas,
    };
    const zipBlob = await buildBundleZip({
      picmonic,
      pngBlob: null,
    });
    const imported = await importBundle(await zipBlob.arrayBuffer());
    expect(typeof imported.canvas.backdrop.opacity).toBe("number");
    expect(imported.canvas.backdrop.opacity).toBe(1);
  });
});
