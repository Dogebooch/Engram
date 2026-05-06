"use client";

import { useSyncExternalStore } from "react";
import type { UserAsset } from "./types";

let assets: UserAsset[] = [];
const blobUrls = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function getUserAssetsSnapshot(): UserAsset[] {
  return assets;
}

export function getUserAssetBlobUrl(assetId: string): string | undefined {
  return blobUrls.get(assetId);
}

export function setUserAssets(next: UserAsset[]): void {
  assets = next;
  notify();
}

export function addUserAssetToStore(asset: UserAsset, blobUrl: string): void {
  blobUrls.set(asset.id, blobUrl);
  assets = [asset, ...assets.filter((a) => a.id !== asset.id)];
  notify();
}

export function removeUserAssetFromStore(assetId: string): void {
  const url = blobUrls.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrls.delete(assetId);
  }
  assets = assets.filter((a) => a.id !== assetId);
  notify();
}

export function findAssetByHash(
  sha256: string,
  kind?: UserAsset["kind"],
): UserAsset | undefined {
  return assets.find(
    (a) => a.sha256 === sha256 && (kind === undefined || a.kind === kind),
  );
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useUserAssets(): UserAsset[] {
  return useSyncExternalStore(
    subscribe,
    getUserAssetsSnapshot,
    getUserAssetsSnapshot,
  );
}

/** Test-only. */
export function __resetUserAssetStoreForTests(): void {
  for (const url of blobUrls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
  blobUrls.clear();
  assets = [];
  listeners.clear();
}
