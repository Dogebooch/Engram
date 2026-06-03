"use client";

import { RECENT_SYMBOLS_MAX, SYMBOL_DEFAULT_SIZE } from "@/lib/constants";
import { newId } from "@/lib/id";
import { insertSymbolBullet } from "@/lib/notes/insert";
import { parseNotes } from "@/lib/notes/parse";
import { useStore } from "@/lib/store";
import type { AddSymbolInput } from "@/lib/store/slices/canvas-slice";
import type { Picmonic } from "@/lib/types/picmonic";
import type { PolygonPoint, SymbolLayer } from "@/lib/types/canvas";
import { polygonBBox } from "./polygon-centroid";

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

  const isRegion = input.kind === "region";
  const layer: SymbolLayer = {
    id: newId(),
    ref: isRegion ? "" : input.ref,
    kind: isRegion ? "region" : "library",
    polygon: isRegion ? input.polygon?.map((p) => ({ x: p.x, y: p.y })) : undefined,
    x: input.x,
    y: input.y,
    width: input.width ?? SYMBOL_DEFAULT_SIZE,
    height: input.height ?? SYMBOL_DEFAULT_SIZE,
    rotation: isRegion ? 0 : (input.rotation ?? 0),
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
    // Region symbols don't go into Recent — they're not reusable across
    // scenes, so a "recent regions" strip would be meaningless.
    const recent = isRegion
      ? s.ui.recentSymbolIds
      : [
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

/**
 * Convenience wrapper for the lasso commit path. Computes the bounding box
 * from `polygon` so callers don't have to duplicate the math, then routes
 * through the same single-setState pipeline as a library add (one undo
 * entry, atomic notes/canvas).
 */
export function addRegionFromPolygon(polygon: PolygonPoint[]): string | null {
  if (polygon.length === 0) return null;
  const b = polygonBBox(polygon);
  return addSymbolWithNoteSync({
    ref: "",
    kind: "region",
    polygon,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
  });
}

/**
 * Replace an existing region's polygon (the "Re-trace" affordance) without
 * minting a new id or touching the notes bullet. Bounding box is recomputed
 * to match. No-op if the layer isn't a region or doesn't exist.
 */
export function replaceRegionPolygon(
  layerId: string,
  polygon: PolygonPoint[],
): boolean {
  if (polygon.length === 0) return false;
  const cid = useStore.getState().currentPicmonicId;
  if (!cid) return false;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return false;
  const idx = picmonic.canvas.symbols.findIndex((s) => s.id === layerId);
  if (idx === -1) return false;
  const existing = picmonic.canvas.symbols[idx];
  if (existing.kind !== "region") return false;
  const b = polygonBBox(polygon);
  useStore.setState((s) => {
    const p = s.picmonics[cid];
    if (!p) return s;
    const symbols = p.canvas.symbols.slice();
    const cur = symbols[idx];
    if (!cur || cur.id !== layerId) return s;
    symbols[idx] = {
      ...cur,
      polygon: polygon.map((pt) => ({ x: pt.x, y: pt.y })),
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    };
    const next: Picmonic = {
      ...p,
      canvas: { ...p.canvas, symbols },
      meta: { ...p.meta, updatedAt: Date.now() },
    };
    return { picmonics: { ...s.picmonics, [cid]: next } };
  });
  return true;
}

/**
 * Update a single vertex of a region's polygon. Used by vertex-edit drag.
 * Recomputes bounding box. No-op if the layer isn't a region or the index
 * is out of range.
 */
export function updateRegionVertex(
  layerId: string,
  vertexIndex: number,
  next: PolygonPoint,
): boolean {
  const cid = useStore.getState().currentPicmonicId;
  if (!cid) return false;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return false;
  const cur = picmonic.canvas.symbols.find((s) => s.id === layerId);
  if (!cur || cur.kind !== "region" || !cur.polygon) return false;
  if (vertexIndex < 0 || vertexIndex >= cur.polygon.length) return false;
  const newPolygon = cur.polygon.slice();
  newPolygon[vertexIndex] = { x: next.x, y: next.y };
  return replaceRegionPolygon(layerId, newPolygon);
}

/**
 * Insert a new vertex at `vertexIndex` (between existing vertices) for a
 * region polygon. Returns the inserted index, or -1 if the layer isn't a
 * region. The polygon must keep at least 3 vertices, which is always true
 * after an insertion.
 */
export function insertRegionVertex(
  layerId: string,
  vertexIndex: number,
  point: PolygonPoint,
): number {
  const cid = useStore.getState().currentPicmonicId;
  if (!cid) return -1;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return -1;
  const cur = picmonic.canvas.symbols.find((s) => s.id === layerId);
  if (!cur || cur.kind !== "region" || !cur.polygon) return -1;
  const idx = Math.max(0, Math.min(cur.polygon.length, vertexIndex));
  const newPolygon = cur.polygon.slice();
  newPolygon.splice(idx, 0, { x: point.x, y: point.y });
  if (!replaceRegionPolygon(layerId, newPolygon)) return -1;
  return idx;
}

/**
 * Remove a vertex from a region polygon. No-op if removing would leave the
 * polygon with fewer than 3 vertices (the geometric minimum).
 */
export function deleteRegionVertex(
  layerId: string,
  vertexIndex: number,
): boolean {
  const cid = useStore.getState().currentPicmonicId;
  if (!cid) return false;
  const picmonic = useStore.getState().picmonics[cid];
  if (!picmonic) return false;
  const cur = picmonic.canvas.symbols.find((s) => s.id === layerId);
  if (!cur || cur.kind !== "region" || !cur.polygon) return false;
  if (cur.polygon.length <= 3) return false;
  if (vertexIndex < 0 || vertexIndex >= cur.polygon.length) return false;
  const newPolygon = cur.polygon.slice();
  newPolygon.splice(vertexIndex, 1);
  return replaceRegionPolygon(layerId, newPolygon);
}
