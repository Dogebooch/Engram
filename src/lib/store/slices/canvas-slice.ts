import type { StateCreator } from "zustand";
import {
  RECENT_SYMBOLS_MAX,
  SYMBOL_DEFAULT_SIZE,
  SYMBOL_DUPLICATE_OFFSET,
} from "@/lib/constants";
import { newId } from "@/lib/id";
import type { Picmonic } from "@/lib/types/picmonic";
import type { SymbolLayer } from "@/lib/types/canvas";
import type { RootState } from "../types";

export interface AddSymbolInput {
  ref: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export type ReorderMode = "back" | "forward" | "toBack" | "toFront";

export interface CanvasSlice {
  addSymbol: (input: AddSymbolInput) => string | null;
  updateSymbol: (
    id: string,
    patch: Partial<Omit<SymbolLayer, "id">>,
  ) => void;
  deleteSymbols: (ids: readonly string[]) => void;
  duplicateSymbols: (ids: readonly string[]) => string[];
  reorderSymbol: (id: string, mode: ReorderMode) => void;
}

function withCanvasSymbols(p: Picmonic, symbols: SymbolLayer[]): Picmonic {
  return {
    ...p,
    canvas: { ...p.canvas, symbols },
    meta: { ...p.meta, updatedAt: Date.now() },
  };
}

function reorderTarget(
  mode: ReorderMode,
  idx: number,
  length: number,
): number {
  switch (mode) {
    case "back":
      return Math.max(0, idx - 1);
    case "forward":
      return Math.min(length - 1, idx + 1);
    case "toBack":
      return 0;
    case "toFront":
      return length - 1;
  }
}

export const createCanvasSlice: StateCreator<RootState, [], [], CanvasSlice> = (
  set,
  get,
) => ({
  addSymbol: (input) => {
    const cid = get().currentPicmonicId;
    if (!cid) return null;
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
    set((s) => {
      const picmonic = s.picmonics[cid];
      if (!picmonic) return s;
      const symbols = [...picmonic.canvas.symbols, layer];
      const recent = [
        input.ref,
        ...s.ui.recentSymbolIds.filter((r) => r !== input.ref),
      ].slice(0, RECENT_SYMBOLS_MAX);
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: withCanvasSymbols(picmonic, symbols),
        },
        ui: { ...s.ui, recentSymbolIds: recent },
        selectedSymbolIds: [layer.id],
      };
    });
    return layer.id;
  },

  updateSymbol: (id, patch) => {
    set((s) => {
      const cid = s.currentPicmonicId;
      if (!cid) return s;
      const picmonic = s.picmonics[cid];
      if (!picmonic) return s;
      const idx = picmonic.canvas.symbols.findIndex((sy) => sy.id === id);
      if (idx === -1) return s;
      const existing = picmonic.canvas.symbols[idx];
      const updated: SymbolLayer = { ...existing, ...patch, id: existing.id };
      const symbols = picmonic.canvas.symbols.slice();
      symbols[idx] = updated;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: withCanvasSymbols(picmonic, symbols),
        },
      };
    });
  },

  deleteSymbols: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    set((s) => {
      const cid = s.currentPicmonicId;
      if (!cid) return s;
      const picmonic = s.picmonics[cid];
      if (!picmonic) return s;
      const symbols = picmonic.canvas.symbols.filter((sy) => !idSet.has(sy.id));
      if (symbols.length === picmonic.canvas.symbols.length) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: withCanvasSymbols(picmonic, symbols),
        },
        selectedSymbolIds: s.selectedSymbolIds.filter((sid) => !idSet.has(sid)),
      };
    });
  },

  duplicateSymbols: (ids) => {
    if (ids.length === 0) return [];
    const cid = get().currentPicmonicId;
    if (!cid) return [];
    const picmonic = get().picmonics[cid];
    if (!picmonic) return [];
    const idSet = new Set(ids);
    const sources = picmonic.canvas.symbols.filter((sy) => idSet.has(sy.id));
    if (sources.length === 0) return [];
    const dupes: SymbolLayer[] = sources.map((src) => ({
      ...src,
      id: newId(),
      x: src.x + SYMBOL_DUPLICATE_OFFSET,
      y: src.y + SYMBOL_DUPLICATE_OFFSET,
    }));
    const dupeIds = dupes.map((d) => d.id);
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      const symbols = [...p.canvas.symbols, ...dupes];
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: withCanvasSymbols(p, symbols),
        },
        selectedSymbolIds: dupeIds,
      };
    });
    return dupeIds;
  },

  reorderSymbol: (id, mode) => {
    set((s) => {
      const cid = s.currentPicmonicId;
      if (!cid) return s;
      const picmonic = s.picmonics[cid];
      if (!picmonic) return s;
      const symbols = picmonic.canvas.symbols;
      const idx = symbols.findIndex((sy) => sy.id === id);
      if (idx === -1) return s;
      const target = reorderTarget(mode, idx, symbols.length);
      if (target === idx) return s;
      const next = symbols.slice();
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: withCanvasSymbols(picmonic, next),
        },
      };
    });
  },
});
