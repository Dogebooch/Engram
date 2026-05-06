"use client";

import { get as idbGet, set as idbSet } from "idb-keyval";
import { IDB_KEYS } from "@/lib/constants";
import { emptyUserAssetIndex, type UserAssetIndex } from "./types";

interface LegacyV1Asset {
  id: string;
  displayName: string;
  tags: string[];
  originalFilename: string;
  mimeType: string;
  ext: string;
  size: number;
  sha256: string;
  createdAt: number;
}

interface LegacyV1Index {
  version: 1;
  assets: LegacyV1Asset[];
}

export async function loadIndex(): Promise<UserAssetIndex> {
  const stored = await idbGet<UserAssetIndex | LegacyV1Index>(
    IDB_KEYS.userAssetsIndex,
  );
  if (
    !stored ||
    typeof stored !== "object" ||
    !("assets" in stored) ||
    !Array.isArray((stored as { assets: unknown }).assets)
  ) {
    return emptyUserAssetIndex();
  }
  if (stored.version === 2) return stored;
  if (stored.version === 1) {
    return {
      version: 2,
      assets: stored.assets.map((a) => ({ ...a, kind: "symbol" as const })),
    };
  }
  return emptyUserAssetIndex();
}

export async function saveIndex(index: UserAssetIndex): Promise<void> {
  await idbSet(IDB_KEYS.userAssetsIndex, index);
}
