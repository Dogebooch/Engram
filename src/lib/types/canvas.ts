import type { CANVAS_SCHEMA_VERSION } from "@/lib/constants";

export type SymbolRef = string;

export interface Backdrop {
  /** Reserved for v2 built-in backdrop gallery; unused in v1. */
  ref: SymbolRef | null;
  uploadedBlobId: string | null;
  opacity: number;
}

export function emptyBackdrop(): Backdrop {
  return { ref: null, uploadedBlobId: null, opacity: 1 };
}

export type SymbolKind = "library" | "region";

/** Closed polygon vertex, in stage coordinates. */
export interface PolygonPoint {
  x: number;
  y: number;
}

export interface SymbolLayer {
  id: string;
  ref: SymbolRef;
  /**
   * Discriminator for the layer's source of art:
   *   - `"library"` (or absent — back-compat default): art comes from a
   *     library symbol referenced by `ref`; renders as a Konva.Image.
   *   - `"region"`: layer represents a freehand-traced area of the backdrop.
   *     `polygon` carries the closed shape; `ref` is "" and ignored. The
   *     layer renders as a polygon outline in the editor and drives a
   *     spotlight reveal in Study mode.
   */
  kind?: SymbolKind;
  /**
   * Required when `kind === "region"`. Closed polygon (the renderer joins
   * the last point back to the first) in stage coordinates. `x`, `y`,
   * `width`, `height` mirror the polygon's bounding box so the existing
   * marquee / hotspot / hit-test code continues to work without branching.
   */
  polygon?: PolygonPoint[];
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
    backdrop: emptyBackdrop(),
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
  const needsBackdrop =
    !c.backdrop || typeof c.backdrop.opacity !== "number";
  // Back-compat: legacy records may not carry `kind` on each SymbolLayer.
  // Default to "library" so old data round-trips without changing meaning.
  const needsKind = c.symbols.some((s) => s.kind === undefined);
  if (c.factMeta && c.timeline && !needsBackdrop && !needsKind) return c;
  return {
    ...c,
    backdrop: needsBackdrop
      ? { ...emptyBackdrop(), ...(c.backdrop ?? {}) }
      : c.backdrop,
    symbols: needsKind
      ? c.symbols.map((s) => (s.kind === undefined ? { ...s, kind: "library" } : s))
      : c.symbols,
    factMeta: c.factMeta ?? {},
    timeline: c.timeline ?? [],
  };
}
