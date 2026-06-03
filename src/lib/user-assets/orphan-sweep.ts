"use client";

import { get as idbGet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { useIndexStore } from "@/lib/store/index-store";
import { assetIdFromSymbolRef } from "./refs";
import { deleteBlob, listBlobIds } from "./blob-store";
import { loadIndex } from "./index-store";
import type { Picmonic } from "@/lib/types/picmonic";

/**
 * Walk every persisted picmonic and the user-assets index, then drop any
 * blob in the user-assets blob store that no picmonic references and that
 * isn't kept by the index. Catches orphaned blobs from interrupted imports
 * (blob written, picmonic save killed before completion) and any other path
 * that left a blob behind without a referent.
 *
 * Returns the count of blobs removed so the caller can surface a one-time
 * notice. Cheap to run on startup: list_keys + index read + per-picmonic
 * read.
 */
export async function sweepOrphanUserAssetBlobs(): Promise<number> {
  const blobIds = await listBlobIds();
  if (blobIds.length === 0) return 0;

  const referenced = new Set<string>();

  // Anything in the assets index is intentional retention (uploads waiting
  // to be placed on a canvas) — keep them.
  try {
    const idx = await loadIndex();
    for (const a of idx.assets) {
      referenced.add(a.id);
      if (a.originalBackupId) referenced.add(a.originalBackupId);
    }
  } catch {
    /* if the index can't be read, fall through and rely on picmonic refs */
  }

  // Walk every picmonic in the picmonic-index for canvas refs.
  const picIndex = useIndexStore.getState().index ?? [];
  for (const entry of picIndex) {
    try {
      const p = await idbGet<Picmonic>(picmonicKey(entry.id));
      if (!p) continue;
      const backdropId = p.canvas.backdrop?.uploadedBlobId;
      if (backdropId) referenced.add(backdropId);
      for (const sy of p.canvas.symbols) {
        const aid = assetIdFromSymbolRef(sy.ref);
        if (aid) referenced.add(aid);
      }
    } catch {
      /* skip — better to keep blobs than risk over-deleting */
    }
  }

  let removed = 0;
  for (const id of blobIds) {
    if (referenced.has(id)) continue;
    try {
      await deleteBlob(id);
      removed += 1;
    } catch (err) {
      console.error("[engram] orphan blob delete failed", id, err);
    }
  }
  return removed;
}
