import type { StateCreator } from "zustand";
import type { RootState } from "../types";

export type SyncSource = "canvas" | "editor" | null;

export interface CursorContext {
  factId: string | null;
  symbolIds: string[];
}

export interface SelectionSlice {
  selectedSymbolIds: string[];
  hoveredFactId: string | null;
  cursorFactId: string | null;
  cursorSymbolIds: string[];
  lastActiveFactId: string | null;
  lastSyncSource: SyncSource;
  setSelectedSymbolIds: (ids: string[]) => void;
  toggleSymbolSelection: (id: string) => void;
  /**
   * Replace the selection with `id`, expanded to its group members if `id`
   * belongs to a group. Bypass with the `setSelectedSymbolIds` raw action
   * (e.g., from Transformer-driven multi-select).
   */
  selectGroupAware: (id: string) => void;
  /**
   * Toggle a symbol's group (or itself) in/out of the selection.
   *  - If `id` is grouped and any member is already selected → remove every
   *    member of that group from the selection.
   *  - Otherwise → add the full group (or just `id` if ungrouped) to the
   *    current selection.
   */
  toggleGroupAware: (id: string) => void;
  /**
   * Select every symbol in the current picmonic. No-op when there is no
   * active picmonic. Used by the Cmd/Ctrl+A keybinding outside typing fields.
   */
  selectAllSymbols: () => void;
  clearSelection: () => void;
  setHoveredFact: (id: string | null) => void;
  setCursorContext: (ctx: CursorContext) => void;
  setLastSyncSource: (src: SyncSource) => void;
}

function membersOfGroup(
  state: RootState,
  id: string,
): string[] {
  const cid = state.currentPicmonicId;
  if (!cid) return [id];
  const picmonic = state.picmonics[cid];
  if (!picmonic) return [id];
  const target = picmonic.canvas.symbols.find((sy) => sy.id === id);
  if (!target?.groupId) return [id];
  const groupId = target.groupId;
  return picmonic.canvas.symbols
    .filter((sy) => sy.groupId === groupId)
    .map((sy) => sy.id);
}

export const createSelectionSlice: StateCreator<RootState, [], [], SelectionSlice> = (set, get) => ({
  selectedSymbolIds: [],
  hoveredFactId: null,
  cursorFactId: null,
  cursorSymbolIds: [],
  lastActiveFactId: null,
  lastSyncSource: null,
  setSelectedSymbolIds: (ids) => set({ selectedSymbolIds: ids }),
  toggleSymbolSelection: (id) =>
    set((s) => ({
      selectedSymbolIds: s.selectedSymbolIds.includes(id)
        ? s.selectedSymbolIds.filter((x) => x !== id)
        : [...s.selectedSymbolIds, id],
    })),
  selectGroupAware: (id) => {
    const ids = membersOfGroup(get(), id);
    set({ selectedSymbolIds: ids });
  },
  toggleGroupAware: (id) => {
    const members = membersOfGroup(get(), id);
    const memberSet = new Set(members);
    set((s) => {
      const anySelected = s.selectedSymbolIds.some((sid) => memberSet.has(sid));
      if (anySelected) {
        return {
          selectedSymbolIds: s.selectedSymbolIds.filter(
            (sid) => !memberSet.has(sid),
          ),
        };
      }
      return {
        selectedSymbolIds: [...s.selectedSymbolIds, ...members],
      };
    });
  },
  selectAllSymbols: () => {
    const state = get();
    const cid = state.currentPicmonicId;
    if (!cid) return;
    const picmonic = state.picmonics[cid];
    if (!picmonic) return;
    const ids = picmonic.canvas.symbols.map((sy) => sy.id);
    set({ selectedSymbolIds: ids });
  },
  clearSelection: () => set({ selectedSymbolIds: [], hoveredFactId: null }),
  setHoveredFact: (id) => set({ hoveredFactId: id }),
  setCursorContext: (ctx) =>
    set((s) => ({
      cursorFactId: ctx.factId,
      cursorSymbolIds: ctx.symbolIds,
      lastActiveFactId: ctx.factId ?? s.lastActiveFactId,
    })),
  setLastSyncSource: (src) => set({ lastSyncSource: src }),
});
