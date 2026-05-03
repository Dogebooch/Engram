import type { StateCreator } from "zustand";
import {
  RECENT_SYMBOLS_MAX,
  SYMBOL_DEFAULT_SIZE,
  SYMBOL_DUPLICATE_OFFSET,
} from "@/lib/constants";
import { newId } from "@/lib/id";
import { parseNotes } from "@/lib/notes/parse";
import {
  tagSymbolWithFact as runTagWithFact,
  tagSymbolWithNewFact as runTagWithNewFact,
  type TagResult,
} from "@/lib/notes/tag";
import type { Picmonic } from "@/lib/types/picmonic";
import type { FactHotspots, Group, SymbolLayer } from "@/lib/types/canvas";
import type { RootState } from "../types";

export interface AddSymbolInput {
  ref: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  /**
   * Optional pre-assigned UUID. Used by the "swap broken chip" flow so the
   * existing chip's `{sym:UUID}` token resolves to the new layer without a
   * notes-string rewrite. When omitted, a fresh UUID is generated.
   */
  id?: string;
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
  groupSymbols: (ids: readonly string[]) => string | null;
  ungroupSymbols: (ids: readonly string[]) => void;
  /**
   * Tag one or more symbols against an existing fact (by synthesized factId).
   * Idempotent. Returns true if any tag actually wrote to notes.
   */
  tagSymbolsWithFact: (
    symbolIds: readonly string[],
    factId: string,
  ) => boolean;
  /**
   * Tag one or more symbols against a new fact (by name). The first call
   * creates the heading; subsequent symbols re-use the synthesized factId.
   * Returns the resolved factId (or empty string on no-op).
   */
  tagSymbolsWithNewFact: (
    symbolIds: readonly string[],
    factName: string,
  ) => string;
  /**
   * Pin a fact's hotspot to a specific world-space coordinate. Sets
   * `userOverride: true` so subsequent symbol moves do not recompute its
   * position. Used by the Player when the user drags a hotspot circle.
   */
  setHotspotOverride: (factId: string, x: number, y: number) => void;
  /**
   * Remove a fact's hotspot override entry. The hotspot reverts to the
   * computed centroid of its linked symbols.
   */
  clearHotspotOverride: (factId: string) => void;
}

function withCanvasSymbols(p: Picmonic, symbols: SymbolLayer[]): Picmonic {
  return {
    ...p,
    canvas: { ...p.canvas, symbols },
    meta: { ...p.meta, updatedAt: Date.now() },
  };
}

function withCanvas(
  p: Picmonic,
  patch: { symbols?: SymbolLayer[]; groups?: Group[] },
): Picmonic {
  return {
    ...p,
    canvas: {
      ...p.canvas,
      symbols: patch.symbols ?? p.canvas.symbols,
      groups: patch.groups ?? p.canvas.groups,
    },
    meta: { ...p.meta, updatedAt: Date.now() },
  };
}

function withFactHotspots(p: Picmonic, factHotspots: FactHotspots): Picmonic {
  return {
    ...p,
    canvas: { ...p.canvas, factHotspots },
    meta: { ...p.meta, updatedAt: Date.now() },
  };
}

function pruneEmptyGroups(
  groups: Group[],
  symbols: readonly SymbolLayer[],
): Group[] {
  const live = new Set(
    symbols.filter((s) => s.groupId).map((s) => s.groupId as string),
  );
  return groups.filter((g) => live.has(g.id));
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
      id: input.id ?? newId(),
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

  groupSymbols: (ids) => {
    if (ids.length < 2) return null;
    const cid = get().currentPicmonicId;
    if (!cid) return null;
    const picmonic = get().picmonics[cid];
    if (!picmonic) return null;
    const idSet = new Set(ids);
    // Only group symbols that actually exist.
    const present = picmonic.canvas.symbols.filter((sy) => idSet.has(sy.id));
    if (present.length < 2) return null;
    const newGroupId = newId();
    const presentIds = new Set(present.map((sy) => sy.id));
    const symbols = picmonic.canvas.symbols.map((sy) =>
      presentIds.has(sy.id) ? { ...sy, groupId: newGroupId } : sy,
    );
    // Drop any existing groups that the just-grouped members belonged to;
    // pruneEmptyGroups will sweep those that no longer contain anyone.
    let groups = picmonic.canvas.groups.filter(
      (g) => !present.some((sy) => sy.groupId === g.id),
    );
    groups = pruneEmptyGroups(groups, symbols);
    groups = [
      ...groups,
      { id: newGroupId, name: null, symbolIds: present.map((sy) => sy.id) },
    ];
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: withCanvas(p, { symbols, groups }),
        },
      };
    });
    return newGroupId;
  },

  ungroupSymbols: (ids) => {
    if (ids.length === 0) return;
    const cid = get().currentPicmonicId;
    if (!cid) return;
    const picmonic = get().picmonics[cid];
    if (!picmonic) return;
    const idSet = new Set(ids);
    // Collect distinct groupIds among the selection.
    const dissolveGroupIds = new Set<string>();
    for (const sy of picmonic.canvas.symbols) {
      if (idSet.has(sy.id) && sy.groupId) dissolveGroupIds.add(sy.groupId);
    }
    if (dissolveGroupIds.size === 0) return;
    const symbols = picmonic.canvas.symbols.map((sy) =>
      sy.groupId && dissolveGroupIds.has(sy.groupId)
        ? { ...sy, groupId: null }
        : sy,
    );
    const groups = picmonic.canvas.groups.filter(
      (g) => !dissolveGroupIds.has(g.id),
    );
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: withCanvas(p, { symbols, groups }),
        },
      };
    });
  },

  tagSymbolsWithFact: (symbolIds, factId) => {
    if (symbolIds.length === 0 || !factId) return false;
    const cid = get().currentPicmonicId;
    if (!cid) return false;
    let picmonic = get().picmonics[cid];
    if (!picmonic) return false;

    let notes = picmonic.notes;
    let parsed = parseNotes(notes);
    let wrote = false;
    for (const symbolId of symbolIds) {
      const r: TagResult = runTagWithFact(notes, parsed, symbolId, factId);
      if (!r.alreadyTagged && r.newNotes !== notes) {
        notes = r.newNotes;
        parsed = parseNotes(notes);
        wrote = true;
      }
    }
    if (!wrote) return false;

    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: {
            ...p,
            notes,
            meta: { ...p.meta, updatedAt: Date.now() },
          },
        },
        lastSyncSource: "canvas",
      };
    });
    return true;
  },

  setHotspotOverride: (factId, x, y) => {
    if (!factId) return;
    const cid = get().currentPicmonicId;
    if (!cid) return;
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      const next: FactHotspots = {
        ...p.canvas.factHotspots,
        [factId]: { x, y, userOverride: true },
      };
      return {
        picmonics: { ...s.picmonics, [cid]: withFactHotspots(p, next) },
      };
    });
  },

  clearHotspotOverride: (factId) => {
    if (!factId) return;
    const cid = get().currentPicmonicId;
    if (!cid) return;
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      if (!(factId in p.canvas.factHotspots)) return s;
      const next: FactHotspots = { ...p.canvas.factHotspots };
      delete next[factId];
      return {
        picmonics: { ...s.picmonics, [cid]: withFactHotspots(p, next) },
      };
    });
  },

  tagSymbolsWithNewFact: (symbolIds, factName) => {
    if (symbolIds.length === 0) return "";
    const trimmed = factName.trim();
    if (!trimmed) return "";
    const cid = get().currentPicmonicId;
    if (!cid) return "";
    const picmonic = get().picmonics[cid];
    if (!picmonic) return "";

    let notes = picmonic.notes;
    let parsed = parseNotes(notes);

    // First symbol: may create the heading. After this, factId is fixed.
    const firstId = symbolIds[0];
    const firstResult = runTagWithNewFact(notes, parsed, firstId, trimmed);
    const factId = firstResult.factId;
    if (!factId) return "";
    if (firstResult.newNotes !== notes) {
      notes = firstResult.newNotes;
      parsed = parseNotes(notes);
    }

    // Remaining symbols: tag against the now-known factId.
    for (let i = 1; i < symbolIds.length; i++) {
      const r = runTagWithFact(notes, parsed, symbolIds[i], factId);
      if (!r.alreadyTagged && r.newNotes !== notes) {
        notes = r.newNotes;
        parsed = parseNotes(notes);
      }
    }

    if (notes === picmonic.notes) return factId;

    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: {
            ...p,
            notes,
            meta: { ...p.meta, updatedAt: Date.now() },
          },
        },
        lastSyncSource: "canvas",
      };
    });
    return factId;
  },
});
