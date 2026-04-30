import type { StateCreator } from "zustand";
import type { RootState } from "../types";

export interface FactPickerState {
  open: boolean;
  symbolIds: readonly string[];
}

export interface SymbolContextMenuState {
  x: number;
  y: number;
  symbolId: string;
}

export interface InteractionsSlice {
  factPicker: FactPickerState | null;
  contextMenu: SymbolContextMenuState | null;
  /** Ephemeral; intentionally outside `ui` so reload defaults to closed. */
  helpOpen: boolean;
  openFactPicker: (symbolIds: readonly string[]) => void;
  closeFactPicker: () => void;
  openSymbolContextMenu: (
    x: number,
    y: number,
    symbolId: string,
  ) => void;
  closeSymbolContextMenu: () => void;
  setHelpOpen: (open: boolean) => void;
}

export const createInteractionsSlice: StateCreator<
  RootState,
  [],
  [],
  InteractionsSlice
> = (set) => ({
  factPicker: null,
  contextMenu: null,
  helpOpen: false,
  openFactPicker: (symbolIds) => {
    if (symbolIds.length === 0) return;
    set({ factPicker: { open: true, symbolIds: [...symbolIds] } });
  },
  closeFactPicker: () => set({ factPicker: null }),
  openSymbolContextMenu: (x, y, symbolId) =>
    set({ contextMenu: { x, y, symbolId } }),
  closeSymbolContextMenu: () => set({ contextMenu: null }),
  setHelpOpen: (open) => set({ helpOpen: open }),
});
