import type { CANVAS_SCHEMA_VERSION } from "@/lib/constants";

export type SymbolRef = string;

export interface Backdrop {
  ref: SymbolRef | null;
  uploadedBlobId: string | null;
}

export interface SymbolLayer {
  id: string;
  ref: SymbolRef;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  layerIndex: number;
  groupId: string | null;
  animation: string | null;
  animationDelay: number | null;
  animationDuration: number | null;
}

export interface Group {
  id: string;
  name: string | null;
  symbolIds: string[];
}

export interface FactHotspot {
  x: number;
  y: number;
  userOverride: boolean;
}

export type FactHotspots = Record<string, FactHotspot>;

/**
 * v2 scaffolding — per-fact metadata not derivable from markdown.
 * Currently only carries an optional audio narration ref. Keyed by factId
 * (synthesized in `parse.ts`), parallel to `factHotspots`.
 */
export interface FactMeta {
  audioRef: string | null;
}

export type FactMetaMap = Record<string, FactMeta>;

/**
 * v2 scaffolding — fact playback ordering for animated video export.
 * Empty in v1; populated by a future timeline editor. The order of entries
 * is the playback order.
 */
export interface TimelineEntry {
  factId: string;
  startMs: number;
  durationMs: number;
}

export interface CanvasState {
  schemaVersion: typeof CANVAS_SCHEMA_VERSION;
  backdrop: Backdrop;
  symbols: SymbolLayer[];
  groups: Group[];
  factHotspots: FactHotspots;
  /** v2 scaffolding (no UI in v1). See `FactMeta`. */
  factMeta: FactMetaMap;
  /** v2 scaffolding (no UI in v1). See `TimelineEntry`. */
  timeline: TimelineEntry[];
}

export function emptyCanvas(): CanvasState {
  return {
    schemaVersion: 1,
    backdrop: { ref: null, uploadedBlobId: null },
    symbols: [],
    groups: [],
    factHotspots: {},
    factMeta: {},
    timeline: [],
  };
}

/**
 * Fill missing fields on a canvas record loaded from older persisted state
 * (pre-scaffolding bundles or IDB rows). Pure: returns a new object only
 * when fields actually need defaulting.
 */
export function normalizeCanvas(c: CanvasState): CanvasState {
  if (c.factMeta && c.timeline) return c;
  return {
    ...c,
    factMeta: c.factMeta ?? {},
    timeline: c.timeline ?? [],
  };
}
