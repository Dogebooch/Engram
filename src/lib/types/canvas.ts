import type { CANVAS_SCHEMA_VERSION } from "@/lib/constants";

export type SymbolRef = string;
export type SymbolKind = "image" | "region";
export type RegionShape = "rect" | "polygon";

export interface RegionPoint {
  x: number;
  y: number;
}

/**
 * An additional traced polygon belonging to the same symbol (e.g. two almonds
 * that share one bullet). `x`/`y` are offsets from the owning layer's origin
 * (`layer.x`/`layer.y`) in the layer's unrotated frame; `points` are relative to
 * the ring's own bounding box. Storing offsets (not absolute coords) lets a
 * move/rotate of the symbol carry every ring for free — only resize rescales
 * them. Render/hit-test/transform additions only; the primary ring
 * (`points` + bbox) stays the source of truth for anchor/number/transform.
 * Deleting an individual ring is not supported (re-trace via delete-symbol).
 */
export interface OutlineRing {
  x: number;
  y: number;
  width: number;
  height: number;
  points: RegionPoint[];
}

export interface Backdrop {
  /** Reserved for v2 built-in backdrop gallery; unused in v1. */
  ref: SymbolRef | null;
  uploadedBlobId: string | null;
  opacity: number;
}

export function emptyBackdrop(): Backdrop {
  return { ref: null, uploadedBlobId: null, opacity: 1 };
}

interface BaseSymbolLayer {
  id: string;
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

export interface ImageSymbolLayer extends BaseSymbolLayer {
  kind: "image";
  ref: SymbolRef;
}

export interface RegionSymbolLayer extends BaseSymbolLayer {
  kind: "region";
  ref: null;
  shape: RegionShape;
  points?: RegionPoint[];
  /** Extra traced polygons sharing this symbol. See {@link OutlineRing}. */
  extraOutlines?: OutlineRing[];
}

export type SymbolLayer = ImageSymbolLayer | RegionSymbolLayer;

export function isImageSymbolLayer(layer: SymbolLayer): layer is ImageSymbolLayer {
  return layer.kind === "image";
}

export function isRegionSymbolLayer(layer: SymbolLayer): layer is RegionSymbolLayer {
  return layer.kind === "region";
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
  const symbols = normalizeSymbolLayers(c.symbols ?? []);
  const needsSymbols = symbols !== c.symbols;
  if (c.factMeta && c.timeline && !needsBackdrop && !needsSymbols) return c;
  return {
    ...c,
    backdrop: needsBackdrop
      ? { ...emptyBackdrop(), ...(c.backdrop ?? {}) }
      : c.backdrop,
    symbols,
    factMeta: c.factMeta ?? {},
    timeline: c.timeline ?? [],
  };
}

type UnknownSymbolLayer = Partial<BaseSymbolLayer> & {
  kind?: SymbolKind;
  ref?: SymbolRef | null;
  shape?: unknown;
  points?: unknown;
  extraOutlines?: unknown;
};

function normalizeSymbolLayers(
  layers: readonly UnknownSymbolLayer[],
): SymbolLayer[] {
  let changed = false;
  const normalized = layers.map((layer) => {
    if (layer.kind === "region") {
      const rawShape = isRegionShape(layer.shape) ? layer.shape : "rect";
      const points = normalizeRegionPoints(layer.points);
      const shape = rawShape === "polygon" && points ? "polygon" : "rect";
      const extraOutlines = normalizeOutlineRings(layer.extraOutlines);
      const next = {
        ...layer,
        kind: "region",
        ref: null,
        shape,
        points: shape === "polygon" ? points : undefined,
        ...(extraOutlines ? { extraOutlines } : {}),
      } as RegionSymbolLayer;
      if (!extraOutlines) delete (next as { extraOutlines?: unknown }).extraOutlines;
      if (
        layer.ref !== null ||
        layer.shape !== next.shape ||
        layer.points !== next.points ||
        layer.extraOutlines !== next.extraOutlines
      ) {
        changed = true;
      }
      return next;
    }

    const next = {
      ...layer,
      kind: "image",
      ref: typeof layer.ref === "string" ? layer.ref : "",
    } as ImageSymbolLayer;
    if (layer.kind !== "image" || layer.ref !== next.ref) changed = true;
    return next;
  });
  return changed ? normalized : (layers as SymbolLayer[]);
}

function isRegionShape(shape: unknown): shape is RegionShape {
  return shape === "rect" || shape === "polygon";
}

function normalizeOutlineRings(rings: unknown): OutlineRing[] | null {
  if (!Array.isArray(rings)) return null;
  const out: OutlineRing[] = [];
  for (const ring of rings) {
    if (typeof ring !== "object" || ring === null) continue;
    const r = ring as Partial<OutlineRing>;
    const points = normalizeRegionPoints(r.points);
    if (
      !points ||
      !Number.isFinite(r.x) ||
      !Number.isFinite(r.y) ||
      !Number.isFinite(r.width) ||
      !Number.isFinite(r.height)
    ) {
      continue;
    }
    out.push({
      x: r.x as number,
      y: r.y as number,
      width: r.width as number,
      height: r.height as number,
      points,
    });
  }
  return out.length > 0 ? out : null;
}

function normalizeRegionPoints(points: unknown): RegionPoint[] | null {
  if (!Array.isArray(points) || points.length < 3) return null;
  const out: RegionPoint[] = [];
  for (const point of points) {
    if (
      typeof point !== "object" ||
      point === null ||
      !Number.isFinite((point as { x?: unknown }).x) ||
      !Number.isFinite((point as { y?: unknown }).y)
    ) {
      return null;
    }
    out.push({
      x: (point as { x: number }).x,
      y: (point as { y: number }).y,
    });
  }
  return out;
}
