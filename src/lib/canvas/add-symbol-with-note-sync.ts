"use client";

import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { insertSymbolBullet } from "@/lib/notes/insert";
import type { AddSymbolInput } from "@/lib/store/slices/canvas-slice";

/**
 * Add a library symbol to the canvas AND insert a `* {sym:UUID}` bullet
 * into the notes for the active picmonic. Single source of truth for both
 * the drag-drop flow ([use-canvas-drop.ts]) and the click-to-add flow
 * ([symbol-library/index.tsx]) so they cannot diverge.
 *
 * Returns the new symbol layer id, or null if no active picmonic.
 */
export function addSymbolWithNoteSync(input: AddSymbolInput): string | null {
  const state = useStore.getState();
  const layerId = state.addSymbol(input);
  if (!layerId) return null;

  const cid = state.currentPicmonicId;
  if (!cid) return layerId;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return layerId;

  const parsed = parseNotes(picmonic.notes);
  const lastActive = state.lastActiveFactId;
  const targetFactId =
    lastActive && parsed.factsById.has(lastActive) ? lastActive : null;
  const result = insertSymbolBullet(
    picmonic.notes,
    parsed,
    targetFactId,
    layerId,
  );
  state.setNotes(cid, result.newNotes);
  state.setLastSyncSource("canvas");
  return layerId;
}
