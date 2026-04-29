import type { StateCreator } from "zustand";
import type { RootState } from "../types";

export interface SelectionSlice {
  selectedSymbolIds: string[];
  hoveredFactId: string | null;
  setSelectedSymbolIds: (ids: string[]) => void;
  toggleSymbolSelection: (id: string) => void;
  clearSelection: () => void;
  setHoveredFact: (id: string | null) => void;
}

export const createSelectionSlice: StateCreator<RootState, [], [], SelectionSlice> = (set) => ({
  selectedSymbolIds: [],
  hoveredFactId: null,
  setSelectedSymbolIds: (ids) => set({ selectedSymbolIds: ids }),
  toggleSymbolSelection: (id) =>
    set((s) => ({
      selectedSymbolIds: s.selectedSymbolIds.includes(id)
        ? s.selectedSymbolIds.filter((x) => x !== id)
        : [...s.selectedSymbolIds, id],
    })),
  clearSelection: () => set({ selectedSymbolIds: [], hoveredFactId: null }),
  setHoveredFact: (id) => set({ hoveredFactId: id }),
});
