import type { StateCreator } from "zustand";
import type { RootState } from "../types";

export interface ConfirmPendingSymbolDeleteOptions {
  /** When true, also clears `ui.confirmSymbolDelete` so future deletes skip the dialog. */
  dontAskAgain?: boolean;
}

export interface FactPickerState {
  open: boolean;
  mode: "tag" | "move";
  symbolIds: readonly string[];
  fromFactId?: string;
}

export interface SymbolContextMenuState {
  x: number;
  y: number;
  symbolId: string;
}

/**
 * Right-click on empty canvas (away from any symbol). `x/y` are viewport
 * coords for menu placement; `stageX/stageY` are stage-local coords used to
 * place pasted symbols at the click position.
 */
export interface StageContextMenuState {
  x: number;
  y: number;
  stageX: number;
  stageY: number;
}

export interface ReplacePickerState {
  x: number;
  y: number;
  symbolId: string;
}

export interface PendingSymbolDeleteState {
  ids: readonly string[];
}

export interface OutlineWalkthroughState {
  /** Symbol ids missing an outline, in author order. */
  queue: readonly string[];
  /** 0-based position of the symbol currently being outlined. */
  index: number;
}

export interface InteractionsSlice {
  factPicker: FactPickerState | null;
  addSymbolTargetFactId: string | null;
  contextMenu: SymbolContextMenuState | null;
  stageContextMenu: StageContextMenuState | null;
  replacePicker: ReplacePickerState | null;
  annotationMode: boolean;
  /** Ephemeral; intentionally outside `ui` so reload defaults to closed. */
  helpOpen: boolean;
  /**
   * Pending request to delete one or more canvas symbols, awaiting user
   * confirmation via the delete-confirm dialog. Transient — never persisted.
   */
  pendingSymbolDelete: PendingSymbolDeleteState | null;
  /**
   * The symbol whose outline the next closed region-draft polygon binds to.
   * When set, `closeRegionDraft` routes to `setSymbolOutline(id)` instead of
   * minting a new bullet. Transient — never persisted, never in history.
   */
  outlineTargetSymbolId: string | null;
  /** Symbol awaiting the "Add an outline?" confirm dialog. Transient. */
  outlineConfirmSymbolId: string | null;
  /** Active "outline every missing symbol" walkthrough, or null. Transient. */
  outlineWalkthrough: OutlineWalkthroughState | null;
  /**
   * The symbol whose description/meaning/why is being edited in the canvas
   * popover. Visibility is also gated on that symbol being the sole selection
   * (see describe-popover.tsx), so this only needs the id. Transient — never
   * persisted; reload defaults to closed.
   */
  describePopover: { symbolId: string } | null;
  /** Whether the stock-symbol library slide-over is open. Transient. */
  libraryDrawerOpen: boolean;
  openFactPicker: (symbolIds: readonly string[]) => void;
  openMoveFactPicker: (symbolId: string, fromFactId: string) => void;
  closeFactPicker: () => void;
  setAddSymbolTargetFact: (factId: string | null) => void;
  clearAddSymbolTargetFact: () => void;
  openSymbolContextMenu: (
    x: number,
    y: number,
    symbolId: string,
  ) => void;
  closeSymbolContextMenu: () => void;
  openStageContextMenu: (
    x: number,
    y: number,
    stageX: number,
    stageY: number,
  ) => void;
  closeStageContextMenu: () => void;
  openReplacePicker: (x: number, y: number, symbolId: string) => void;
  closeReplacePicker: () => void;
  setAnnotationMode: (active: boolean) => void;
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
  /** Arm the next region-draft polygon to bind to this symbol id (or clear). */
  setOutlineTarget: (id: string | null) => void;
  /** Open the per-chip "Add an outline?" confirm for this symbol. */
  requestOutlineConfirm: (id: string) => void;
  /** Dismiss the "Add an outline?" confirm. */
  dismissOutlineConfirm: () => void;
  /**
   * Arm an outline draw for `id`: selects the symbol (so notes scroll to its
   * bullet) and enters annotation mode. Returns "needs-backdrop" when no
   * background image is set yet (target is still armed so the caller can route
   * to a background-picker, after which the canvas auto-continues).
   */
  startOutlineForSymbol: (id: string) => "ready" | "needs-backdrop";
  /** Begin a one-by-one walkthrough over symbols missing outlines. */
  startOutlineWalkthrough: (
    ids: readonly string[],
  ) => "ready" | "needs-backdrop" | "empty";
  /** Advance to the next walkthrough symbol; ends the walkthrough past the end. */
  advanceOutlineWalkthrough: () => "next" | "done" | "inactive";
  /** Abort/clear the walkthrough and disarm the outline target + annotation. */
  endOutlineWalkthrough: () => void;
  /** Open the describe popover for a symbol (no-op on empty id). */
  openDescribePopover: (symbolId: string) => void;
  /** Dismiss the describe popover without changing the selection. */
  closeDescribePopover: () => void;
  setLibraryDrawerOpen: (open: boolean) => void;
  toggleLibraryDrawer: () => void;
}

export const createInteractionsSlice: StateCreator<
  RootState,
  [],
  [],
  InteractionsSlice
> = (set, get) => ({
  factPicker: null,
  addSymbolTargetFactId: null,
  contextMenu: null,
  stageContextMenu: null,
  replacePicker: null,
  annotationMode: false,
  helpOpen: false,
  pendingSymbolDelete: null,
  outlineTargetSymbolId: null,
  outlineConfirmSymbolId: null,
  outlineWalkthrough: null,
  describePopover: null,
  libraryDrawerOpen: false,
  openFactPicker: (symbolIds) => {
    if (symbolIds.length === 0) return;
    set({ factPicker: { open: true, mode: "tag", symbolIds: [...symbolIds] } });
  },
  openMoveFactPicker: (symbolId, fromFactId) => {
    if (!symbolId || !fromFactId) return;
    set({
      factPicker: {
        open: true,
        mode: "move",
        symbolIds: [symbolId],
        fromFactId,
      },
    });
  },
  closeFactPicker: () => set({ factPicker: null }),
  setAddSymbolTargetFact: (factId) => set({ addSymbolTargetFactId: factId }),
  clearAddSymbolTargetFact: () => set({ addSymbolTargetFactId: null }),
  openSymbolContextMenu: (x, y, symbolId) =>
    set({ contextMenu: { x, y, symbolId } }),
  closeSymbolContextMenu: () => set({ contextMenu: null }),
  openStageContextMenu: (x, y, stageX, stageY) =>
    set({ stageContextMenu: { x, y, stageX, stageY } }),
  closeStageContextMenu: () => set({ stageContextMenu: null }),
  openReplacePicker: (x, y, symbolId) =>
    set({ replacePicker: { x, y, symbolId } }),
  closeReplacePicker: () => set({ replacePicker: null }),
  setAnnotationMode: (active) =>
    // Leaving annotation mode also disarms the "active Fact" so a later
    // library add doesn't silently inherit a stale outline target.
    set(active ? { annotationMode: true } : { annotationMode: false, addSymbolTargetFactId: null }),
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
  setOutlineTarget: (id) => set({ outlineTargetSymbolId: id }),
  requestOutlineConfirm: (id) => {
    if (!id) return;
    set({ outlineConfirmSymbolId: id });
  },
  dismissOutlineConfirm: () => set({ outlineConfirmSymbolId: null }),
  startOutlineForSymbol: (id) => {
    if (!id) return "needs-backdrop";
    const state = get();
    set({ outlineTargetSymbolId: id });
    const cid = state.currentPicmonicId;
    const backdrop = cid ? state.picmonics[cid]?.canvas.backdrop : null;
    if (!backdrop?.uploadedBlobId) return "needs-backdrop";
    state.setLastSyncSource("canvas");
    state.setSelectedSymbolIds([id]);
    state.setAnnotationMode(true);
    return "ready";
  },
  startOutlineWalkthrough: (ids) => {
    if (ids.length === 0) return "empty";
    const queue = [...ids];
    set({ outlineWalkthrough: { queue, index: 0 } });
    const status = get().startOutlineForSymbol(queue[0]);
    if (status === "needs-backdrop") {
      // Can't draw without a background — abandon the queue; the caller routes
      // the first symbol through the confirm dialog's background-picker.
      set({ outlineWalkthrough: null });
    }
    return status;
  },
  advanceOutlineWalkthrough: () => {
    const wt = get().outlineWalkthrough;
    if (!wt) return "inactive";
    const nextIndex = wt.index + 1;
    if (nextIndex >= wt.queue.length) {
      get().endOutlineWalkthrough();
      return "done";
    }
    set({ outlineWalkthrough: { queue: wt.queue, index: nextIndex } });
    get().startOutlineForSymbol(wt.queue[nextIndex]);
    return "next";
  },
  endOutlineWalkthrough: () => {
    set({ outlineWalkthrough: null, outlineTargetSymbolId: null });
    get().setAnnotationMode(false);
  },
  openDescribePopover: (symbolId) => {
    if (!symbolId) return;
    set({ describePopover: { symbolId } });
  },
  closeDescribePopover: () => set({ describePopover: null }),
  setLibraryDrawerOpen: (open) => set({ libraryDrawerOpen: open }),
  toggleLibraryDrawer: () =>
    set((s) => ({ libraryDrawerOpen: !s.libraryDrawerOpen })),
});
