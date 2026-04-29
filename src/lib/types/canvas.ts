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

export interface CanvasState {
  schemaVersion: typeof CANVAS_SCHEMA_VERSION;
  backdrop: Backdrop;
  symbols: SymbolLayer[];
  groups: Group[];
  factHotspots: FactHotspots;
}

export function emptyCanvas(): CanvasState {
  return {
    schemaVersion: 1,
    backdrop: { ref: null, uploadedBlobId: null },
    symbols: [],
    groups: [],
    factHotspots: {},
  };
}
