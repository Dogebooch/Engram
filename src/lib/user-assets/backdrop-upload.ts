"use client";

import {
  USER_ASSET_ALLOWED_MIMES,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { newId } from "@/lib/id";
import { checkStorageQuota, thresholdAt } from "@/lib/storage/quota";
import { putBlob } from "./blob-store";
import { extForMime } from "./refs";

export type BackdropUploadResult =
  | {
      kind: "ok";
      id: string;
      mimeType: string;
      ext: string;
      size: number;
      filename: string;
    }
  | { kind: "rejected"; filename: string; reason: BackdropUploadReject };

export type BackdropUploadReject =
  | "mime"
  | "size"
  | "quota"
  | "empty"
  | "read-error";

/**
 * Upload an image to be used as a scene backdrop. Backdrops live in the same
 * IDB blob store as user-uploaded symbols, but are NOT registered as symbols
 * (no library tile, no `user:<id>` ref). Round-trip into/out of the export
 * bundle is handled separately via the bundle assets manifest's
 * `backdrops` section.
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

  const id = newId();
  const blob = new Blob([buf], { type: file.type });
  await putBlob(id, blob);

  return {
    kind: "ok",
    id,
    mimeType: file.type,
    ext: extForMime(file.type),
    size: file.size,
    filename: file.name,
  };
}
