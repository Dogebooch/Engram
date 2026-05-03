import type { StateCreator } from "zustand";
import { removeAllSymbolReferences } from "@/lib/notes/insert";
import type { RootState } from "../types";

export interface ConfirmPendingSymbolDeleteOptions {
  /** When true, also clears `ui.confirmSymbolDelete` so future deletes skip the dialog. */
  dontAskAgain?: boolean;
}

export interface FactPickerState {
  open: boolean;
  symbolIds: readonly string[];
}

/**
 * Symbol-library picker shared by the broken-chip swap, the right-click
 * "Replace symbol…" flow, and the per-fact "+ Symbol" action.
 *
 * - swap-broken: chip's UUID is preserved; canvas symbol spawns with
 *   `{ id: chipUuid, ref: pickedRef }` so the chip stops rendering as
 *   missing without any notes-string surgery.
 * - replace: chip's UUID is rewritten to the new spawned symbol's id so the
 *   chip points to the new layer. Notes mutate via `replaceSymbolUuid`.
 * - add-to-fact: spawns a new symbol AND appends a `* {sym:UUID} ` bullet
 *   under `factId` via `insertSymbolBullet`.
 */
export type SymbolPickerState =
  | { mode: "swap-broken"; chipUuid: string }
  | { mode: "replace"; chipUuid: string }
  | { mode: "add-to-fact"; factId: string };

export interface SymbolContextMenuState {
  x: number;
  y: number;
  symbolId: string;
}

export interface PendingSymbolDeleteState {
  ids: readonly string[];
  /**
   * When true, on confirm we also strip every `{sym:UUID}` bullet from the
   * notes. Used by the sidebar's "Delete symbol entirely…" action so the
   * destruction is total. Default false preserves the existing canvas-Delete
   * behavior (chips become broken in notes; user can untag manually).
   */
  scrubReferences?: boolean;
}

export interface InteractionsSlice {
  factPicker: FactPickerState | null;
  symbolPicker: SymbolPickerState | null;
  contextMenu: SymbolContextMenuState | null;
  /** Ephemeral; intentionally outside `ui` so reload defaults to closed. */
  helpOpen: boolean;
  /**
   * Pending request to delete one or more canvas symbols, awaiting user
   * confirmation via the delete-confirm dialog. Transient — never persisted.
   */
  pendingSymbolDelete: PendingSymbolDeleteState | null;
  openFactPicker: (symbolIds: readonly string[]) => void;
  closeFactPicker: () => void;
  openSymbolPicker: (state: SymbolPickerState) => void;
  closeSymbolPicker: () => void;
  openSymbolContextMenu: (
    x: number,
    y: number,
    symbolId: string,
  ) => void;
  closeSymbolContextMenu: () => void;
  setHelpOpen: (open: boolean) => void;
  requestSymbolDelete: (
    ids: readonly string[],
    opts?: { scrubReferences?: boolean },
  ) => void;
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
  symbolPicker: null,
  contextMenu: null,
  helpOpen: false,
  pendingSymbolDelete: null,
  openFactPicker: (symbolIds) => {
    if (symbolIds.length === 0) return;
    set({ factPicker: { open: true, symbolIds: [...symbolIds] } });
  },
  closeFactPicker: () => set({ factPicker: null }),
  openSymbolPicker: (state) => set({ symbolPicker: state }),
  closeSymbolPicker: () => set({ symbolPicker: null }),
  openSymbolContextMenu: (x, y, symbolId) =>
    set({ contextMenu: { x, y, symbolId } }),
  closeSymbolContextMenu: () => set({ contextMenu: null }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  requestSymbolDelete: (ids, opts) => {
    if (ids.length === 0) return;
    set({
      pendingSymbolDelete: {
        ids: [...ids],
        scrubReferences: opts?.scrubReferences,
      },
    });
  },
  cancelSymbolDelete: () => set({ pendingSymbolDelete: null }),
  confirmPendingSymbolDelete: (opts) => {
    const state = get();
    const pending = state.pendingSymbolDelete;
    if (!pending) return;
    if (opts?.dontAskAgain) state.setConfirmSymbolDelete(false);
    if (pending.scrubReferences) {
      const cid = state.currentPicmonicId;
      const picmonic = cid ? state.picmonics[cid] : null;
      if (cid && picmonic) {
        let nextNotes = picmonic.notes;
        for (const id of pending.ids) {
          nextNotes = removeAllSymbolReferences(nextNotes, id);
        }
        if (nextNotes !== picmonic.notes) {
          state.setNotes(cid, nextNotes);
        }
      }
    }
    state.deleteSymbols(pending.ids);
    set({ pendingSymbolDelete: null });
  },
});
