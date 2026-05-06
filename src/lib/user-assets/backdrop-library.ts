"use client";

import { sha256Hex } from "./hash";
import { getBlob } from "./blob-store";
import { loadIndex, saveIndex } from "./index-store";
import { extForMime } from "./refs";
import {
  addUserAssetToStore,
  getUserAssetBlobUrl,
  getUserAssetsSnapshot,
} from "./store";
import type { UserAsset } from "./types";

/**
 * If a backdrop blob exists in IDB but has no asset-index entry (because it
 * was uploaded before backgrounds were indexed), retroactively register it
 * as a `kind: "background"` asset so it shows up in the Backgrounds grid.
 * Idempotent — does nothing if already indexed or if the blob is missing.
 */
export async function ensureBackdropIndexed(
  blobId: string,
): Promise<UserAsset | null> {
  const snapshot = getUserAssetsSnapshot();
  const cached = snapshot.find((a) => a.id === blobId);
  if (cached) return cached;

  const index = await loadIndex();
  const existing = index.assets.find((a) => a.id === blobId);
  if (existing) return existing;

  const blob = await getBlob(blobId);
  if (!blob) {
    console.warn(
      `[engram] ensureBackdropIndexed: blob missing for ${blobId}; skipping`,
    );
    return null;
  }

  const buf = await blob.arrayBuffer();
  const sha256 = await sha256Hex(buf);

  const asset: UserAsset = {
    id: blobId,
    kind: "background",
    displayName: "Background",
    tags: [],
    originalFilename: `background.${extForMime(blob.type)}`,
    mimeType: blob.type || "image/png",
    ext: extForMime(blob.type || "image/png"),
    size: blob.size,
    sha256,
    createdAt: Date.now(),
  };

  await saveIndex({
    version: index.version,
    assets: [asset, ...index.assets],
  });

  const url = URL.createObjectURL(blob);
  addUserAssetToStore(asset, url);

  return asset;
}

/**
 * Rename a background asset's displayName. Persists to the index.
 */
export async function renameBackgroundAsset(
  id: string,
  newName: string,
): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const index = await loadIndex();
  const idx = index.assets.findIndex((a) => a.id === id);
  if (idx === -1) return;
  const updated = { ...index.assets[idx], displayName: trimmed };
  const next = index.assets.slice();
  next[idx] = updated;
  await saveIndex({ version: index.version, assets: next });
  // Refresh the in-memory store entry, reusing the existing object URL so
  // any open <img> stays valid.
  const url = getUserAssetBlobUrl(id);
  if (url) addUserAssetToStore(updated, url);
}

/**
 * Delete a background asset from the index, in-memory store, and blob store.
 * Caller is responsible for clearing any scene that references it.
 */
export async function deleteBackgroundAsset(id: string): Promise<void> {
  const { deleteUserAsset } = await import("./delete");
  await deleteUserAsset(id);
}
