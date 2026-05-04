"use client";

import { get as idbGet, set as idbSet } from "idb-keyval";
import { IDB_KEYS } from "@/lib/constants";
import { emptyUserAssetIndex, type UserAssetIndex } from "./types";

export async function loadIndex(): Promise<UserAssetIndex> {
  const stored = await idbGet<UserAssetIndex>(IDB_KEYS.userAssetsIndex);
  if (
    stored &&
    typeof stored === "object" &&
    Array.isArray(stored.assets) &&
    stored.version === 1
  ) {
    return stored;
  }
  return emptyUserAssetIndex();
}

export async function saveIndex(index: UserAssetIndex): Promise<void> {
  await idbSet(IDB_KEYS.userAssetsIndex, index);
}
