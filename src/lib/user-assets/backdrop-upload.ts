"use client";

import {
  USER_ASSET_ALLOWED_MIMES,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { newId } from "@/lib/id";
import { checkStorageQuota, thresholdAt } from "@/lib/storage/quota";
import { putBlob } from "./blob-store";
import { sha256Hex } from "./hash";
import { loadIndex, saveIndex } from "./index-store";
import { deriveDisplayName, deriveTags, extForMime } from "./refs";
import { addUserAssetToStore, findAssetByHash } from "./store";
import type { UserAsset } from "./types";

export type BackdropUploadResult =
  | {
      kind: "ok";
      id: string;
      mimeType: string;
      ext: string;
      size: number;
      filename: string;
      asset: UserAsset;
      reusedExisting: boolean;
    }
  | { kind: "rejected"; filename: string; reason: BackdropUploadReject };

export type BackdropUploadReject =
  | "mime"
  | "size"
  | "quota"
  | "empty"
  | "read-error";

/**
 * Upload an image to be used as a scene backdrop. Backdrops live alongside
 * user-uploaded symbols in the same IDB blob store and asset index, but are
 * tagged with `kind: "background"` so they don't show up in the symbol grid
 * or as `user:<id>` refs. Same-hash uploads dedupe to the existing entry so
 * the same image can be reused across scenes without re-uploading.
 */
export async function uploadBackdropImage(
  file: File,
): Promise<BackdropUploadResult> {
  if (file.size === 0) {
    return { kind: "rejected", filename: file.name, reason: "empty" };
  }
  if (!USER_ASSET_ALLOWED_MIMES.includes(file.type)) {
    return { kind: "rejected", filename: file.name, reason: "mime" };
  }
  if (file.size > USER_ASSET_MAX_BYTES) {
    return { kind: "rejected", filename: file.name, reason: "size" };
  }

  const est = await checkStorageQuota();
  if (est && thresholdAt(est.percent) === "95") {
    return { kind: "rejected", filename: file.name, reason: "quota" };
  }

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return { kind: "rejected", filename: file.name, reason: "read-error" };
  }

  const sha256 = await sha256Hex(buf);
  const existing = findAssetByHash(sha256, "background");
  if (existing) {
    return {
      kind: "ok",
      id: existing.id,
      mimeType: existing.mimeType,
      ext: existing.ext,
      size: existing.size,
      filename: file.name,
      asset: existing,
      reusedExisting: true,
    };
  }

  const id = newId();
  const asset: UserAsset = {
    id,
    kind: "background",
    displayName: deriveDisplayName(file.name),
    tags: deriveTags(file.name),
    originalFilename: file.name,
    mimeType: file.type,
    ext: extForMime(file.type),
    size: file.size,
    sha256,
    createdAt: Date.now(),
  };

  const blob = new Blob([buf], { type: file.type });
  await putBlob(id, blob);

  const index = await loadIndex();
  await saveIndex({
    version: index.version,
    assets: [asset, ...index.assets.filter((a) => a.id !== id)],
  });

  const url = URL.createObjectURL(blob);
  addUserAssetToStore(asset, url);

  return {
    kind: "ok",
    id,
    mimeType: file.type,
    ext: extForMime(file.type),
    size: file.size,
    filename: file.name,
    asset,
    reusedExisting: false,
  };
}
