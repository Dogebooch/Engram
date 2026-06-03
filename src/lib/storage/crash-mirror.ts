"use client";

import {
  CRASH_MIRROR_PREFIX,
  crashMirrorKey,
} from "@/lib/constants";
import type { Picmonic } from "@/lib/types/picmonic";

/**
 * Synchronously mirror a picmonic into localStorage so an in-flight
 * 250ms IDB debounce can't be lost when the tab is killed. localStorage
 * writes are sync and survive process termination; IDB writes don't.
 *
 * Recovered on startup by `recoverCrashMirrors()`, then cleared.
 */
export function writeCrashMirror(picmonic: Picmonic): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(crashMirrorKey(picmonic.id), JSON.stringify(picmonic));
  } catch {
    // Quota errors are non-fatal — the IDB save still happens.
  }
}

export function clearCrashMirror(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(crashMirrorKey(id));
  } catch {
    /* noop */
  }
}

/**
 * Read every crash-mirror entry currently in localStorage. Caller is
 * responsible for clearing each entry after the recovery write to IDB
 * succeeds (via `clearCrashMirror`).
 */
export function readCrashMirrors(): Picmonic[] {
  if (typeof localStorage === "undefined") return [];
  const out: Picmonic[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(CRASH_MIRROR_PREFIX)) continue;
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Picmonic;
      if (parsed && typeof parsed.id === "string") out.push(parsed);
    } catch {
      // Drop malformed entries on next clear.
    }
  }
  return out;
}
