export interface StorageEstimate {
  used: number;
  quota: number;
  percent: number;
}

/**
 * Returns persistent-storage estimate. Returns null if the API is unavailable
 * (e.g. Firefox private mode, very old browsers).
 *
 * Note: `navigator.storage.estimate()` is per-origin and includes ALL storage
 * (IndexedDB, Cache API, service workers, etc.). For Engram, IDB is the only
 * meaningful consumer, so the estimate ≈ Picmonic data + thumbnails.
 */
export async function checkStorageQuota(): Promise<StorageEstimate | null> {
  if (typeof navigator === "undefined") return null;
  if (!navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    const used = est.usage ?? 0;
    const quota = est.quota ?? 0;
    if (quota <= 0) return null;
    return {
      used,
      quota,
      percent: (used / quota) * 100,
    };
  } catch {
    return null;
  }
}

export type QuotaThreshold = "80" | "95";

/** Pure helper — given a percent, what threshold does it cross (if any)? */
export function thresholdAt(percent: number): QuotaThreshold | null {
  if (percent >= 95) return "95";
  if (percent >= 80) return "80";
  return null;
}
