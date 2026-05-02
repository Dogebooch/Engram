"use client";

import { set as idbSet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { useStore } from "./index";

/**
 * Persist the current picmonic to IDB *now*, bypassing the debounce window
 * owned by `useDebouncedPicmonicSave`. Drives the save-status state machine
 * the same way the debounced path does (saving → saved → idle linger), so
 * UI consumers see one consistent transition regardless of which trigger
 * (auto-save timer vs. explicit ⌘S / File ▸ Save) fired the write.
 *
 * Returns true on success, false if there's nothing to save (no active
 * picmonic) or the write threw — caller decides how to surface the error;
 * the store already flips `saveStatus` to `error` on throw.
 */
export async function saveCurrentPicmonicNow(): Promise<boolean> {
  const s = useStore.getState();
  const cid = s.currentPicmonicId;
  if (!cid) return false;
  const picmonic = s.picmonics[cid];
  if (!picmonic) return false;

  s.setSaveStatus("saving");
  try {
    await idbSet(picmonicKey(cid), picmonic);
    const after = useStore.getState();
    if (after.currentPicmonicId !== cid) return true;
    after.setLastSavedAt(Date.now());
    after.setSaveStatus("saved");
    return true;
  } catch (err) {
    console.error("[engram] explicit save failed", err);
    useStore.getState().setSaveStatus("error");
    return false;
  }
}
