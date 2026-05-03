"use client";

import { RECENT_SYMBOLS_MAX, SYMBOL_DEFAULT_SIZE } from "@/lib/constants";
import { newId } from "@/lib/id";
import { insertSymbolBullet } from "@/lib/notes/insert";
import { parseNotes } from "@/lib/notes/parse";
import { useStore } from "@/lib/store";
import type { AddSymbolInput } from "@/lib/store/slices/canvas-slice";
import type { Picmonic } from "@/lib/types/picmonic";
import type { SymbolLayer } from "@/lib/types/canvas";

/**
 * Add a library symbol to the canvas AND insert a `* {sym:UUID}` bullet
 * into the notes for the active picmonic. Single source of truth for both
 * the drag-drop flow ([use-canvas-drop.ts]) and the click-to-add flow
 * ([symbol-library/index.tsx]) so they cannot diverge.
 *
 * Issues ONE setState so the operation lands as a single zundo history entry
 * (canvas + notes restored together by undo).
 *
 * Returns the new symbol layer id, or null if no active picmonic.
 */
export function addSymbolWithNoteSync(input: AddSymbolInput): string | null {
  const cid = useStore.getState().currentPicmonicId;
  if (!cid) return null;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return null;

  const layer: SymbolLayer = {
    id: newId(),
    ref: input.ref,
    x: input.x,
    y: input.y,
    width: input.width ?? SYMBOL_DEFAULT_SIZE,
    height: input.height ?? SYMBOL_DEFAULT_SIZE,
    rotation: input.rotation ?? 0,
    layerIndex: 0,
    groupId: null,
    animation: null,
    animationDelay: null,
    animationDuration: null,
  };

  const parsed = parseNotes(picmonic.notes);
  const lastActive = useStore.getState().lastActiveFactId;
  const targetFactId =
    lastActive && parsed.factsById.has(lastActive) ? lastActive : null;
  const insert = insertSymbolBullet(picmonic.notes, parsed, targetFactId, layer.id);

  useStore.setState((s) => {
    const p = s.picmonics[cid];
    if (!p) return s;
    const symbols = [...p.canvas.symbols, layer];
    const recent = [
      input.ref,
      ...s.ui.recentSymbolIds.filter((r) => r !== input.ref),
    ].slice(0, RECENT_SYMBOLS_MAX);
    const next: Picmonic = {
      ...p,
      canvas: { ...p.canvas, symbols },
      notes: insert.newNotes,
      meta: { ...p.meta, updatedAt: Date.now() },
    };
    return {
      picmonics: { ...s.picmonics, [cid]: next },
      ui: { ...s.ui, recentSymbolIds: recent },
      selectedSymbolIds: [layer.id],
      lastSyncSource: "canvas",
    };
  });

  return layer.id;
}
