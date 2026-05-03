import type { StateCreator } from "zustand";
import type { RootState } from "../types";

export interface ConfirmPendingSymbolDeleteOptions {
  /** When true, also clears `ui.confirmSymbolDelete` so future deletes skip the dialog. */
  dontAskAgain?: boolean;
}

export interface FactPickerState {
  open: boolean;
  symbolIds: readonly string[];
}

export interface SymbolContextMenuState {
  x: number;
  y: number;
  symbolId: string;
}

export interface ReplacePickerState {
  x: number;
  y: number;
  symbolId: string;
}

export interface PendingSymbolDeleteState {
  ids: readonly string[];
}

export interface InteractionsSlice {
  factPicker: FactPickerState | null;
  contextMenu: SymbolContextMenuState | null;
  replacePicker: ReplacePickerState | null;
  /** Ephemeral; intentionally outside `ui` so reload defaults to closed. */
  helpOpen: boolean;
  /**
   * Pending request to delete one or more canvas symbols, awaiting user
   * confirmation via the delete-confirm dialog. Transient — never persisted.
   */
  pendingSymbolDelete: PendingSymbolDeleteState | null;
  openFactPicker: (symbolIds: readonly string[]) => void;
  closeFactPicker: () => void;
  openSymbolContextMenu: (
    x: number,
    y: number,
    symbolId: string,
  ) => void;
  closeSymbolContextMenu: () => void;
  openReplacePicker: (x: number, y: number, symbolId: string) => void;
  closeReplacePicker: () => void;
  setHelpOpen: (open: boolean) => void;
  requestSymbolDelete: (ids: readonly string[]) => void;
  cancelSymbolDelete: () => void;
  /**
   * Resolve a pending symbol-delete request: optionally clears the
   * `ui.confirmSymbolDelete` opt-in, deletes the requested symbols, and
   * clears the pending state. No-op if there is no pending request.
   */
  confirmPendingSymbolDelete: (
    opts?: ConfirmPendingSymbolDeleteOptions,
  ) => void;
}

export const createInteractionsSlice: StateCreator<
  RootState,
  [],
  [],
  InteractionsSlice
> = (set, get) => ({
  factPicker: null,
  contextMenu: null,
  replacePicker: null,
  helpOpen: false,
  pendingSymbolDelete: null,
  openFactPicker: (symbolIds) => {
    if (symbolIds.length === 0) return;
    set({ factPicker: { open: true, symbolIds: [...symbolIds] } });
  },
  closeFactPicker: () => set({ factPicker: null }),
  openSymbolContextMenu: (x, y, symbolId) =>
    set({ contextMenu: { x, y, symbolId } }),
  closeSymbolContextMenu: () => set({ contextMenu: null }),
  openReplacePicker: (x, y, symbolId) =>
    set({ replacePicker: { x, y, symbolId } }),
  closeReplacePicker: () => set({ replacePicker: null }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  requestSymbolDelete: (ids) => {
    if (ids.length === 0) return;
    set({ pendingSymbolDelete: { ids: [...ids] } });
  },
  cancelSymbolDelete: () => set({ pendingSymbolDelete: null }),
  confirmPendingSymbolDelete: (opts) => {
    const state = get();
    const pending = state.pendingSymbolDelete;
    if (!pending) return;
    if (opts?.dontAskAgain) state.setConfirmSymbolDelete(false);
    state.deleteSymbols(pending.ids);
    set({ pendingSymbolDelete: null });
  },
});
