"use client";

import { RECENT_SYMBOLS_MAX, SYMBOL_DEFAULT_SIZE } from "@/lib/constants";
import { newId } from "@/lib/id";
import { insertSymbolBullet } from "@/lib/notes/insert";
import { parseNotes } from "@/lib/notes/parse";
import { useStore } from "@/lib/store";
import type { AddSymbolInput } from "@/lib/store/slices/canvas-slice";
import type { Picmonic } from "@/lib/types/picmonic";
import type {
  RegionPoint,
  RegionShape,
  RegionSymbolLayer,
  SymbolLayer,
} from "@/lib/types/canvas";

interface AddSymbolWithNoteInput extends AddSymbolInput {
  targetFactId?: string | null;
}

function resolveTargetFactId(
  parsed: ReturnType<typeof parseNotes>,
  explicitTargetFactId?: string | null,
): string | null {
  if (explicitTargetFactId && parsed.factsById.has(explicitTargetFactId)) {
    return explicitTargetFactId;
  }
  const activeAddTarget = useStore.getState().addSymbolTargetFactId;
  if (activeAddTarget && parsed.factsById.has(activeAddTarget)) {
    return activeAddTarget;
  }
  const lastActive = useStore.getState().lastActiveFactId;
  return lastActive && parsed.factsById.has(lastActive) ? lastActive : null;
}

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
export function addSymbolWithNoteSync(input: AddSymbolWithNoteInput): string | null {
  const cid = useStore.getState().currentPicmonicId;
  if (!cid) return null;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return null;

  const layer: SymbolLayer = {
    id: newId(),
    kind: "image",
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
  const targetFactId = resolveTargetFactId(parsed, input.targetFactId);
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
      addSymbolTargetFactId: null,
    };
  });

  return layer.id;
}

export interface AddRegionInput {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: RegionShape;
  points?: RegionPoint[];
  rotation?: number;
}

/**
 * Add a backdrop-region annotation to the canvas and insert a matching
 * `{sym:UUID}` bullet. Region layers carry geometry only; the bullet remains
 * the prose source of truth.
 */
export function addRegionWithNoteSync(input: AddRegionInput): string | null {
  if (input.shape === "polygon" && (!input.points || input.points.length < 3)) {
    return null;
  }
  const cid = useStore.getState().currentPicmonicId;
  if (!cid) return null;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return null;

  const layer: RegionSymbolLayer = {
    id: newId(),
    kind: "region",
    ref: null,
    shape: input.shape ?? "rect",
    points: input.shape === "polygon" ? input.points : undefined,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation ?? 0,
    layerIndex: 0,
    groupId: null,
    animation: null,
    animationDelay: null,
    animationDuration: null,
  };

  const parsed = parseNotes(picmonic.notes);
  const targetFactId = resolveTargetFactId(parsed);
  const insert = insertSymbolBullet(picmonic.notes, parsed, targetFactId, layer.id);

  useStore.setState((s) => {
    const p = s.picmonics[cid];
    if (!p) return s;
    const symbols = [...p.canvas.symbols, layer];
    const next: Picmonic = {
      ...p,
      canvas: { ...p.canvas, symbols },
      notes: insert.newNotes,
      meta: { ...p.meta, updatedAt: Date.now() },
    };
    return {
      picmonics: { ...s.picmonics, [cid]: next },
      selectedSymbolIds: [layer.id],
      lastSyncSource: "canvas",
      // NOTE: the active Fact (addSymbolTargetFactId) is intentionally NOT
      // cleared here, so consecutive outlines in one annotation session keep
      // filing under the same Fact. It is cleared on annotation-mode exit.
    };
  });

  return layer.id;
}
