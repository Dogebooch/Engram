import type { CANVAS_SCHEMA_VERSION } from "@/lib/constants";

export type SymbolRef = string;
export type SymbolKind = "image" | "region";
export type RegionShape = "rect";

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
  shape?: RegionShape;
};

function normalizeSymbolLayers(
  layers: readonly UnknownSymbolLayer[],
): SymbolLayer[] {
  let changed = false;
  const normalized = layers.map((layer) => {
    if (layer.kind === "region") {
      const next = {
        ...layer,
        kind: "region",
        ref: null,
        shape: layer.shape ?? "rect",
      } as RegionSymbolLayer;
      if (layer.ref !== null || layer.shape !== next.shape) changed = true;
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
