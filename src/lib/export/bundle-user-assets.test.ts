import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clear as idbClear } from "idb-keyval";
import JSZip from "jszip";
import {
  BUNDLE_SCHEMA_VERSION,
  CANVAS_SCHEMA_VERSION,
} from "@/lib/constants";
import { getSymbolById } from "@/lib/symbols";
import { __resetSymbolsCacheForTests } from "@/lib/symbols/load";
import { emptyCanvas, type CanvasState } from "@/lib/types/canvas";
import type { Picmonic } from "@/lib/types/picmonic";
import { uploadUserAssets } from "@/lib/user-assets/upload";
import {
  __resetUserAssetStoreForTests,
  getUserAssetsSnapshot,
} from "@/lib/user-assets/store";
import { __resetUserAssetsLoadForTests } from "@/lib/user-assets/load";
import { getBlob } from "@/lib/user-assets/blob-store";
import { loadIndex } from "@/lib/user-assets/index-store";
import { userAssetSymbolId } from "@/lib/user-assets/refs";
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

function makePicmonicReferencing(symbolId: string): Picmonic {
  const layerId = "11111111-1111-4111-8111-111111111111";
  const canvas: CanvasState = {
    ...emptyCanvas(),
    symbols: [
      {
        id: layerId,
        ref: symbolId,
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
  };
  return {
    id: "picmonic-with-asset",
    meta: {
      name: "With Asset",
      tags: [],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_500,
    },
    notes: `## Fact\n* {sym:${layerId}} desc\n`,
    canvas,
  };
}

describe("bundle round-trip with user assets", () => {
  it("emits assets/manifest.json and restores blobs on import", async () => {
    const upload = await uploadUserAssets([
      new File([PNG_BYTES], "round.png", { type: "image/png" }),
    ]);
    const asset = upload.added[0];
    const symbolId = userAssetSymbolId(asset.id);

    const picmonic = makePicmonicReferencing(symbolId);
    const blob = await getBlob(asset.id);
    const zipBlob = await buildBundleZip({
      picmonic,
      pngBlob: null,
      userAssets: [{ asset, blob: blob! }],
    });
    const zipBytes = await zipBlob.arrayBuffer();

    // Verify ZIP layout.
    const zip = await JSZip.loadAsync(zipBytes);
    let manifestPath = "";
    let assetPath = "";
    let metaPath = "";
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const norm = path.replace(/\\/g, "/");
      if (norm.endsWith("assets/manifest.json")) manifestPath = norm;
      if (norm.endsWith(`assets/${asset.id}.${asset.ext}`)) assetPath = norm;
      if (norm.endsWith("meta.json")) metaPath = norm;
    });
    expect(manifestPath).not.toBe("");
    expect(assetPath).not.toBe("");
    expect(metaPath).not.toBe("");
    const meta = JSON.parse(await zip.file(metaPath)!.async("string"));
    expect(meta.schemaVersion).toBe(BUNDLE_SCHEMA_VERSION);

    // Wipe everything then import.
    __resetUserAssetStoreForTests();
    __resetSymbolsCacheForTests();
    __resetUserAssetsLoadForTests();
    await idbClear();

    const imported = await importBundle(zipBytes);
    expect(imported.canvas.symbols[0].ref).toBe(symbolId);
    expect(imported.canvas.schemaVersion).toBe(CANVAS_SCHEMA_VERSION);

    // Asset was restored to IDB + symbol cache + live store.
    const idx = await loadIndex();
    expect(idx.assets.find((a) => a.id === asset.id)).toBeDefined();
    expect(await getBlob(asset.id)).toBeDefined();
    expect(getSymbolById(symbolId)?.source).toBe("user");
    expect(getUserAssetsSnapshot().find((a) => a.id === asset.id)).toBeDefined();
  });

  it("re-importing the same bundle skips duplicate index entry", async () => {
    const upload = await uploadUserAssets([
      new File([PNG_BYTES], "twice.png", { type: "image/png" }),
    ]);
    const asset = upload.added[0];
    const blob = await getBlob(asset.id);
    const picmonic = makePicmonicReferencing(userAssetSymbolId(asset.id));
    const zipBlob = await buildBundleZip({
      picmonic,
      pngBlob: null,
      userAssets: [{ asset, blob: blob! }],
    });
    const bytes = await zipBlob.arrayBuffer();

    await importBundle(bytes); // index already has it from upload
    const idx1 = await loadIndex();
    await importBundle(bytes);
    const idx2 = await loadIndex();
    const count1 = idx1.assets.filter((a) => a.id === asset.id).length;
    const count2 = idx2.assets.filter((a) => a.id === asset.id).length;
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });
});
