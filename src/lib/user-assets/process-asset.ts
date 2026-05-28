"use client";

import { newId } from "@/lib/id";
import { useStore } from "@/lib/store";
import { registerUserSymbols } from "@/lib/symbols";
import type { Picmonic } from "@/lib/types/picmonic";
import { isImageSymbolLayer } from "@/lib/types/canvas";
import { deleteBlob, getBlob, putBlob } from "./blob-store";
import { sha256Hex } from "./hash";
import { loadIndex, saveIndex } from "./index-store";
import { toSymbolEntry } from "./load";
import { extForMime, userAssetSymbolId } from "./refs";
import { removeBackground } from "./remove-background";
import {
  addUserAssetToStore,
  getUserAssetBlobUrl,
  getUserAssetsSnapshot,
} from "./store";
import type { UserAsset } from "./types";

/**
 * Run background removal on the asset's current blob, in place. The original
 * (pre-processing) blob is stashed under `asset.originalBackupId` so the user
 * can {@link restoreOriginalBackground}. Idempotent if `originalBackupId` is
 * already set — the existing backup is preserved across repeat invocations,
 * but the algorithm always runs against the *current* primary blob.
 */
export async function removeBackgroundForAsset(assetId: string): Promise<void> {
  const asset = findAsset(assetId);
  if (!asset) throw new Error(`removeBackgroundForAsset: unknown asset ${assetId}`);

  const currentBlob = await getBlob(assetId);
  if (!currentBlob) throw new Error(`removeBackgroundForAsset: blob missing for ${assetId}`);

  // Stash the original on the first pass so restore is possible.
  let backupId = asset.originalBackupId;
  if (!backupId) {
    backupId = newId();
    await putBlob(backupId, currentBlob);
  }

  const processed = await removeBackground(currentBlob);
  await putBlob(assetId, processed);

  const sha256 = await sha256Hex(await processed.arrayBuffer());
  const updated: UserAsset = {
    ...asset,
    mimeType: "image/png",
    ext: "png",
    size: processed.size,
    sha256,
    originalBackupId: backupId,
  };

  await commitAssetUpdate(updated, processed);
}

/** Swap the processed blob back to the original and clear the backup. */
export async function restoreOriginalBackground(assetId: string): Promise<void> {
  const asset = findAsset(assetId);
  if (!asset) throw new Error(`restoreOriginalBackground: unknown asset ${assetId}`);
  const backupId = asset.originalBackupId;
  if (!backupId) throw new Error(`restoreOriginalBackground: no backup for ${assetId}`);

  const original = await getBlob(backupId);
  if (!original) throw new Error(`restoreOriginalBackground: backup blob missing for ${assetId}`);

  await putBlob(assetId, original);
  await deleteBlob(backupId);

  const sha256 = await sha256Hex(await original.arrayBuffer());
  const updated: UserAsset = {
    ...asset,
    mimeType: original.type || asset.mimeType,
    ext: extForMime(original.type || asset.mimeType),
    size: original.size,
    sha256,
    originalBackupId: undefined,
  };

  await commitAssetUpdate(updated, original);
}

function findAsset(assetId: string): UserAsset | undefined {
  return getUserAssetsSnapshot().find((a) => a.id === assetId);
}

/**
 * Persist `updated` to the index, swap the in-memory blob URL (revoking the
 * old one), and re-register the corresponding symbol entry so canvas + library
 * components re-render with the new image.
 */
async function commitAssetUpdate(updated: UserAsset, blob: Blob): Promise<void> {
  const index = await loadIndex();
  const next = {
    version: index.version,
    assets: index.assets.map((a) => (a.id === updated.id ? updated : a)),
  };
  await saveIndex(next);

  const previousUrl = getUserAssetBlobUrl(updated.id);
  const newUrl = URL.createObjectURL(blob);
  addUserAssetToStore(updated, newUrl);
  if (previousUrl && previousUrl !== newUrl) {
    URL.revokeObjectURL(previousUrl);
  }
  registerUserSymbols([toSymbolEntry(updated, newUrl)]);
  refreshCanvasLayersForUserSymbol(updated.id);
}

/**
 * After a user symbol's blob URL is replaced (background removal / restore),
 * SymbolNode instances on the canvas need to re-render so they re-read the
 * new `entry.imageUrl` via `getSymbolById`. Targeted refresh: produce new
 * layer object references for any layer whose `ref` matches this user symbol,
 * across every loaded picmonic. SymbolNode is `React.memo` keyed on `layer`,
 * so identical-shape-but-new-reference is the minimum poke that triggers a
 * re-render of just the affected nodes.
 */
function refreshCanvasLayersForUserSymbol(assetId: string): void {
  const ref = userAssetSymbolId(assetId);
  useStore.setState((s) => {
    let touched = false;
    const nextPicmonics: Record<string, Picmonic> = { ...s.picmonics };
    for (const [pid, picmonic] of Object.entries(s.picmonics)) {
      if (
        !picmonic.canvas.symbols.some(
          (l) => isImageSymbolLayer(l) && l.ref === ref,
        )
      ) {
        continue;
      }
      const symbols = picmonic.canvas.symbols.map((l) =>
        isImageSymbolLayer(l) && l.ref === ref ? { ...l } : l,
      );
      nextPicmonics[pid] = {
        ...picmonic,
        canvas: { ...picmonic.canvas, symbols },
      };
      touched = true;
    }
    return touched ? { picmonics: nextPicmonics } : s;
  });
}
