/**
 * Best-effort request for persistent IDB storage.
 *
 * Calling `navigator.storage.persist()` flips the per-origin storage from
 * "best-effort" (browser may evict under storage pressure) to "persistent"
 * (browser must prompt before evicting). It does NOT increase the quota —
 * it just stops silent eviction.
 *
 * Browser behavior on this single call:
 *   • Chrome/Edge: silently grants if the user is "engaged" with the site
 *     (bookmark, installed PWA, frequent visits), silently denies otherwise.
 *   • Firefox: shows a one-time inline permission prompt.
 *   • Safari: requires a real user gesture; on-mount calls fall through
 *     silently. We accept that — the next interactive call (e.g. an
 *     eventual settings toggle) can re-attempt under a click handler.
 *
 * Always returns void; never throws. Intended to be fire-and-forget at
 * app startup once IDB is hydrated.
 */
export async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (!navigator.storage?.persist) return;
  try {
    const already = await navigator.storage.persisted();
    if (already) return;
    await navigator.storage.persist();
  } catch {
    /* best-effort — never let this surface as a runtime error */
  }
}
