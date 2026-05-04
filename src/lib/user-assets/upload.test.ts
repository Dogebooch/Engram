import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clear as idbClear } from "idb-keyval";
import { getSymbolById, registerUserSymbols } from "@/lib/symbols";
import { __resetSymbolsCacheForTests } from "@/lib/symbols/load";
import { uploadUserAssets } from "./upload";
import { __resetUserAssetStoreForTests, getUserAssetsSnapshot } from "./store";
import { __resetUserAssetsLoadForTests } from "./load";
import { loadIndex } from "./index-store";
import { getBlob } from "./blob-store";
import { userAssetSymbolId } from "./refs";

const PNG_BYTES = new Uint8Array([
  // 1x1 transparent PNG
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function pngFile(name = "cat.png"): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

beforeEach(async () => {
  __resetUserAssetStoreForTests();
  __resetSymbolsCacheForTests();
  __resetUserAssetsLoadForTests();
  await idbClear();
  // Stub URL.createObjectURL/revokeObjectURL in node test environment.
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

describe("uploadUserAssets", () => {
  it("rejects unsupported mime types", async () => {
    const file = new File(["hello"], "x.txt", { type: "text/plain" });
    const result = await uploadUserAssets([file]);
    expect(result.added).toHaveLength(0);
    expect(result.rejected).toEqual([
      { filename: "x.txt", reason: "mime" },
    ]);
  });

  it("rejects oversized files", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    const result = await uploadUserAssets([big]);
    expect(result.rejected[0]?.reason).toBe("size");
  });

  it("rejects empty files", async () => {
    const empty = new File([], "x.png", { type: "image/png" });
    const result = await uploadUserAssets([empty]);
    expect(result.rejected[0]?.reason).toBe("empty");
  });

  it("adds a valid image and registers it as a symbol", async () => {
    const result = await uploadUserAssets([pngFile()]);
    expect(result.added).toHaveLength(1);
    const asset = result.added[0];
    expect(asset.mimeType).toBe("image/png");
    expect(asset.ext).toBe("png");
    expect(asset.size).toBe(PNG_BYTES.byteLength);
    expect(asset.displayName).toBe("cat");

    // Persisted to index + blob store.
    const idx = await loadIndex();
    expect(idx.assets.map((a) => a.id)).toContain(asset.id);
    const blob = await getBlob(asset.id);
    expect(blob).toBeDefined();
    expect(blob?.size).toBe(PNG_BYTES.byteLength);

    // Registered in the symbol cache.
    const symbol = getSymbolById(userAssetSymbolId(asset.id));
    expect(symbol).toBeDefined();
    expect(symbol?.source).toBe("user");
    expect(symbol?.imageUrl).toMatch(/^blob:/);

    // Live store knows about it.
    expect(getUserAssetsSnapshot().map((a) => a.id)).toContain(asset.id);
  });

  it("dedupes identical uploads by SHA-256", async () => {
    const first = await uploadUserAssets([pngFile("a.png")]);
    expect(first.added).toHaveLength(1);
    const second = await uploadUserAssets([pngFile("b.png")]);
    expect(second.added).toHaveLength(0);
    expect(second.duplicates).toHaveLength(1);
    expect(second.duplicates[0].id).toBe(first.added[0].id);

    const idx = await loadIndex();
    expect(idx.assets).toHaveLength(1);
  });

  it("registerUserSymbols entry is searchable via getSymbolById", () => {
    registerUserSymbols([
      {
        id: "user:abc",
        displayName: "test",
        aliases: [],
        tags: [],
        source: "user",
        qualityRank: 0,
        imageUrl: "blob:fake",
      },
    ]);
    expect(getSymbolById("user:abc")?.displayName).toBe("test");
  });
});
