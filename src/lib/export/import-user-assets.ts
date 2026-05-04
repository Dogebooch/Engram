"use client";

import { putBlob } from "@/lib/user-assets/blob-store";
import { loadIndex, saveIndex } from "@/lib/user-assets/index-store";
import { toSymbolEntry } from "@/lib/user-assets/load";
import { addUserAssetToStore } from "@/lib/user-assets/store";
import type { UserAsset } from "@/lib/user-assets/types";
import { registerUserSymbols } from "@/lib/symbols";

export type { UserAsset };
export { putBlob };

/**
 * Restore imported user assets:
 *  - Write blobs to the user-asset blob store (skip if id already present
 *    in the on-disk index).
 *  - Append metadata to the index.
 *  - Hydrate the in-memory store + symbol cache so canvases referencing
 *    `user:<id>` resolve on first render.
 */
export async function registerImportedUserAssets(
  entries: { asset: UserAsset; blob: Blob }[],
): Promise<void> {
  const index = await loadIndex();
  const existingIds = new Set(index.assets.map((a) => a.id));
  const additions: UserAsset[] = [];
  for (const { asset, blob } of entries) {
    if (existingIds.has(asset.id)) {
      // Already on disk — still ensure blob URL + cache exist for live render.
      ensureLive(asset, blob);
      continue;
    }
    await putBlob(asset.id, blob);
    additions.push(asset);
    ensureLive(asset, blob);
  }
  if (additions.length > 0) {
    await saveIndex({
      version: index.version,
      assets: [...additions, ...index.assets],
    });
  }
}

function ensureLive(asset: UserAsset, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  addUserAssetToStore(asset, url);
  registerUserSymbols([toSymbolEntry(asset, url)]);
}
