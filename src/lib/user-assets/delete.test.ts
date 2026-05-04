import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clear as idbClear } from "idb-keyval";
import { getSymbolById } from "@/lib/symbols";
import { __resetSymbolsCacheForTests } from "@/lib/symbols/load";
import { uploadUserAssets } from "./upload";
import { deleteUserAsset } from "./delete";
import { __resetUserAssetStoreForTests, getUserAssetsSnapshot } from "./store";
import { __resetUserAssetsLoadForTests } from "./load";
import { loadIndex } from "./index-store";
import { getBlob } from "./blob-store";
import { userAssetSymbolId } from "./refs";

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

describe("deleteUserAsset", () => {
  it("removes blob, index entry, and symbol cache entry", async () => {
    const file = new File([PNG_BYTES], "del.png", { type: "image/png" });
    const result = await uploadUserAssets([file]);
    const asset = result.added[0];
    const symbolId = userAssetSymbolId(asset.id);
    expect(getSymbolById(symbolId)).toBeDefined();

    await deleteUserAsset(asset.id);

    expect(getSymbolById(symbolId)).toBeUndefined();
    expect(getUserAssetsSnapshot().find((a) => a.id === asset.id)).toBeUndefined();
    expect(await getBlob(asset.id)).toBeUndefined();
    const idx = await loadIndex();
    expect(idx.assets.find((a) => a.id === asset.id)).toBeUndefined();
  });
});
