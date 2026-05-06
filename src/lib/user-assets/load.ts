"use client";

import { registerUserSymbols, type SymbolEntry } from "@/lib/symbols";
import { getBlob } from "./blob-store";
import { loadIndex } from "./index-store";
import {
  addUserAssetToStore,
  getUserAssetsSnapshot,
  setUserAssets,
} from "./store";
import { userAssetSymbolId } from "./refs";
import type { UserAsset } from "./types";

let loadedOnce = false;
let inFlight: Promise<UserAsset[]> | null = null;

export function loadUserAssets(): Promise<UserAsset[]> {
  if (loadedOnce) return Promise.resolve(getUserAssetsSnapshot());
  if (inFlight) return inFlight;
  inFlight = doLoad()
    .then((assets) => {
      loadedOnce = true;
      inFlight = null;
      return assets;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

async function doLoad(): Promise<UserAsset[]> {
  const index = await loadIndex();
  const hydrated: UserAsset[] = [];
  const entries: SymbolEntry[] = [];
  for (const asset of index.assets) {
    const blob = await getBlob(asset.id);
    if (!blob) {
      console.warn(`[engram] user asset ${asset.id} missing blob; skipping`);
      continue;
    }
    const url = URL.createObjectURL(blob);
    addUserAssetToStore(asset, url);
    hydrated.push(asset);
    if (asset.kind === "symbol") {
      entries.push(toSymbolEntry(asset, url));
    }
  }
  // addUserAssetToStore appends one-by-one with newest-first; reset to
  // canonical newest-first order from the index.
  setUserAssets([...hydrated].sort((a, b) => b.createdAt - a.createdAt));
  registerUserSymbols(entries);
  return getUserAssetsSnapshot();
}

export function toSymbolEntry(asset: UserAsset, blobUrl: string): SymbolEntry {
  return {
    id: userAssetSymbolId(asset.id),
    displayName: asset.displayName,
    aliases: [asset.originalFilename],
    tags: asset.tags,
    source: "user",
    qualityRank: 0,
    imageUrl: blobUrl,
  };
}

/** Test-only. */
export function __resetUserAssetsLoadForTests(): void {
  loadedOnce = false;
  inFlight = null;
}
