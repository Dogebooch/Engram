import type { StateCreator } from "zustand";
import {
  RECENT_SYMBOLS_MAX,
  SYMBOL_DEFAULT_SIZE,
  SYMBOL_DUPLICATE_OFFSET,
} from "@/lib/constants";
import { newId } from "@/lib/id";
import { parseNotes } from "@/lib/notes/parse";
import { removeOrphanedBullets } from "@/lib/notes/remove-bullets";
import {
  tagSymbolsWithFact as runBatchTagWithFact,
  tagSymbolsWithNewFact as runBatchTagWithNewFact,
} from "@/lib/notes/tag";
import type { Picmonic } from "@/lib/types/picmonic";
import {
  emptyBackdrop,
  type Backdrop,
  type CanvasState,
  type FactHotspots,
  type SymbolLayer,
  type Group,
} from "@/lib/types/canvas";
import {
  uploadBackdropImage,
  type BackdropUploadResult,
} from "@/lib/user-assets";
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
  /**
   * Validate + persist an image as the current Picmonic's backdrop.
   * Preserves opacity if a backdrop was already set. Single history entry.
   */
  setBackdropFromUpload: (file: File) => Promise<BackdropUploadResult>;
  /** Clear the active Picmonic's backdrop (blob is left in IDB; orphan sweep is future work). */
  clearBackdrop: () => void;
  /** 0..1, clamped. Caller decides when to snapshot history (see notes-panel pattern). */
  setBackdropOpacity: (opacity: number) => void;
}

function patchCanvas(p: Picmonic, patch: Partial<CanvasState>): Picmonic {
  return {
    ...p,
    canvas: { ...p.canvas, ...patch },
    meta: { ...p.meta, updatedAt: Date.now() },
  };
}

function patchPicmonic(p: Picmonic, patch: Partial<Picmonic>): Picmonic {
  return { ...p, ...patch, meta: { ...p.meta, updatedAt: Date.now() } };
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
          [cid]: patchCanvas(picmonic, { symbols }),
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
      // No-op guard: skip the set entirely if every patched field already
      // matches existing values. Avoids polluting zundo history with a
      // mousedown-mouseup-without-move "drag" that didn't change anything.
      const patchRecord = patch as unknown as Record<string, unknown>;
      const existingRecord = existing as unknown as Record<string, unknown>;
      let changed = false;
      for (const key of Object.keys(patchRecord)) {
        if (patchRecord[key] !== existingRecord[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return s;
      const updated: SymbolLayer = { ...existing, ...patch, id: existing.id };
      const symbols = picmonic.canvas.symbols.slice();
      symbols[idx] = updated;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: patchCanvas(picmonic, { symbols }),
        },
      };
    });
  },

  deleteSymbols: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const lowerIdSet = new Set(ids.map((id) => id.toLowerCase()));
    set((s) => {
      const cid = s.currentPicmonicId;
      if (!cid) return s;
      const picmonic = s.picmonics[cid];
      if (!picmonic) return s;
      const symbols = picmonic.canvas.symbols.filter((sy) => !idSet.has(sy.id));
      if (symbols.length === picmonic.canvas.symbols.length) return s;
      // Strip any orphaned `* {sym:UUID}` bullets atomically so notes + canvas
      // restore together on undo.
      const parsed = parseNotes(picmonic.notes);
      const newNotes = removeOrphanedBullets(picmonic.notes, parsed, lowerIdSet);
      const groups = pruneEmptyGroups(picmonic.canvas.groups, symbols);
      const next: Picmonic = {
        ...picmonic,
        canvas: { ...picmonic.canvas, symbols, groups },
        notes: newNotes,
        meta: { ...picmonic.meta, updatedAt: Date.now() },
      };
      return {
        picmonics: { ...s.picmonics, [cid]: next },
        selectedSymbolIds: s.selectedSymbolIds.filter((sid) => !idSet.has(sid)),
        ...(newNotes !== picmonic.notes ? { lastSyncSource: "canvas" as const } : {}),
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
          [cid]: patchCanvas(p, { symbols }),
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
          [cid]: patchCanvas(picmonic, { symbols: next }),
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
          [cid]: patchCanvas(p, { symbols, groups }),
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
          [cid]: patchCanvas(p, { symbols, groups }),
        },
      };
    });
  },

  tagSymbolsWithFact: (symbolIds, factId) => {
    if (symbolIds.length === 0 || !factId) return false;
    const cid = get().currentPicmonicId;
    if (!cid) return false;
    const picmonic = get().picmonics[cid];
    if (!picmonic) return false;

    const parsed = parseNotes(picmonic.notes);
    const result = runBatchTagWithFact(picmonic.notes, parsed, symbolIds, factId);
    if (result.written === 0) return false;
    const notes = result.newNotes;

    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: patchPicmonic(p, { notes }),
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
        picmonics: { ...s.picmonics, [cid]: patchCanvas(p, { factHotspots: next }) },
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
        picmonics: { ...s.picmonics, [cid]: patchCanvas(p, { factHotspots: next }) },
      };
    });
  },

  setBackdropFromUpload: async (file) => {
    const cid = get().currentPicmonicId;
    if (!cid) {
      return { kind: "rejected", filename: file.name, reason: "empty" };
    }
    const result = await uploadBackdropImage(file);
    if (result.kind !== "ok") return result;
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      // TODO(orphan-sweep): old `uploadedBlobId` may now be unreferenced.
      const prevOpacity = p.canvas.backdrop?.opacity ?? 1;
      const next: Backdrop = {
        ref: null,
        uploadedBlobId: result.id,
        opacity: prevOpacity,
      };
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: patchCanvas(p, { backdrop: next }),
        },
      };
    });
    return result;
  },

  clearBackdrop: () => {
    const cid = get().currentPicmonicId;
    if (!cid) return;
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      const cur = p.canvas.backdrop;
      if (!cur || (cur.uploadedBlobId === null && cur.ref === null)) return s;
      // TODO(orphan-sweep): leaves the blob in IDB.
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: patchCanvas(p, { backdrop: emptyBackdrop() }),
        },
      };
    });
  },

  setBackdropOpacity: (opacity) => {
    const cid = get().currentPicmonicId;
    if (!cid) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      const cur = p.canvas.backdrop ?? emptyBackdrop();
      if (cur.opacity === clamped) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: patchCanvas(p, {
            backdrop: { ...cur, opacity: clamped },
          }),
        },
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

    const parsed = parseNotes(picmonic.notes);
    const result = runBatchTagWithNewFact(
      picmonic.notes,
      parsed,
      symbolIds,
      trimmed,
    );
    const factId = result.factId;
    if (!factId) return "";
    const notes = result.newNotes;
    if (notes === picmonic.notes) return factId;

    set((s) => {
      const p = s.picmonics[cid];
      if (!p) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [cid]: patchPicmonic(p, { notes }),
        },
        lastSyncSource: "canvas",
      };
    });
    return factId;
  },
});
