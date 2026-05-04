"use client";

import {
  USER_ASSET_ALLOWED_MIMES,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { newId } from "@/lib/id";
import { checkStorageQuota, thresholdAt } from "@/lib/storage/quota";
import { registerUserSymbols } from "@/lib/symbols";
import { putBlob } from "./blob-store";
import { sha256Hex } from "./hash";
import { loadIndex, saveIndex } from "./index-store";
import { toSymbolEntry } from "./load";
import { deriveDisplayName, deriveTags, extForMime } from "./refs";
import {
  addUserAssetToStore,
  findAssetByHash,
  getUserAssetsSnapshot,
} from "./store";
import type { UserAsset } from "./types";

export type UploadOutcome =
  | { kind: "added"; asset: UserAsset }
  | { kind: "duplicate"; asset: UserAsset }
  | { kind: "rejected"; filename: string; reason: UploadRejectReason };

export type UploadRejectReason =
  | "mime"
  | "size"
  | "quota"
  | "empty"
  | "read-error";

export interface UploadResult {
  outcomes: UploadOutcome[];
  added: UserAsset[];
  duplicates: UserAsset[];
  rejected: { filename: string; reason: UploadRejectReason }[];
}

export async function uploadUserAssets(
  files: readonly File[],
): Promise<UploadResult> {
  const result: UploadResult = {
    outcomes: [],
    added: [],
    duplicates: [],
    rejected: [],
  };

  for (const file of files) {
    const outcome = await uploadOne(file);
    result.outcomes.push(outcome);
    if (outcome.kind === "added") result.added.push(outcome.asset);
    else if (outcome.kind === "duplicate") result.duplicates.push(outcome.asset);
    else
      result.rejected.push({
        filename: outcome.filename,
        reason: outcome.reason,
      });
  }
  return result;
}

async function uploadOne(file: File): Promise<UploadOutcome> {
  if (file.size === 0) {
    return { kind: "rejected", filename: file.name, reason: "empty" };
  }
  if (!USER_ASSET_ALLOWED_MIMES.includes(file.type)) {
    return { kind: "rejected", filename: file.name, reason: "mime" };
  }
  if (file.size > USER_ASSET_MAX_BYTES) {
    return { kind: "rejected", filename: file.name, reason: "size" };
  }

  // Quota pre-flight (best-effort; null means unsupported).
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
  const existing = findAssetByHash(sha256);
  if (existing) return { kind: "duplicate", asset: existing };

  const id = newId();
  const asset: UserAsset = {
    id,
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
  const nextIndex = {
    version: index.version,
    assets: [asset, ...index.assets.filter((a) => a.id !== id)],
  };
  await saveIndex(nextIndex);

  const url = URL.createObjectURL(blob);
  addUserAssetToStore(asset, url);
  registerUserSymbols([toSymbolEntry(asset, url)]);

  return { kind: "added", asset };
}

export function getCurrentUserAssets(): UserAsset[] {
  return getUserAssetsSnapshot();
}
