"use client";

import { unregisterUserSymbol } from "@/lib/symbols";
import { deleteBlob } from "./blob-store";
import { loadIndex, saveIndex } from "./index-store";
import { userAssetSymbolId } from "./refs";
import { removeUserAssetFromStore } from "./store";

export async function deleteUserAsset(assetId: string): Promise<void> {
  const index = await loadIndex();
  await saveIndex({
    version: index.version,
    assets: index.assets.filter((a) => a.id !== assetId),
  });
  await deleteBlob(assetId);
  unregisterUserSymbol(userAssetSymbolId(assetId));
  removeUserAssetFromStore(assetId);
}
