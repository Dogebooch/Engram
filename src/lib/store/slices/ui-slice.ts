import type { StateCreator } from "zustand";
import { PANEL_DEFAULTS, RECENT_SYMBOLS_MAX } from "@/lib/constants";
import type { RootState } from "../types";

export type PlayerMode = "hotspot" | "sequential";

/**
 * Active editor tool. Determines which interactions the canvas accepts:
 * - `"select"`: marquee, click-to-select, drag, transformer (today's default).
 * - `"lasso"`: pointer-tracking trace on the backdrop to author a region
 *   symbol. Symbol click/drag and marquee are suppressed while active.
 *
 * Transient — never persisted; reload always returns to "select".
 */
export type CanvasTool = "select" | "lasso";

export type QuotaThreshold = "80" | "95";

export interface StorageQuotaState {
  /** Last measured percent of origin quota used (0-100), or null if unknown. */
  percent: number | null;
  /** Highest threshold the user has been warned for; cleared when % drops below 80. */
  lastWarned: QuotaThreshold | null;
}

export interface UiState {
  leftPanelSize: number;
  rightPanelSize: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  recentSymbolIds: string[];
  /** Last study-mode display the user used. Persisted across sessions. */
  lastPlayerMode: PlayerMode;
  /** Persisted so reload doesn't re-fire warnings the user already saw. */
  storageQuota: StorageQuotaState;
  /**
   * When true, deleting a canvas symbol opens a confirmation dialog. The
   * user can opt out via the dialog's "Don't ask again" checkbox.
   */
  confirmSymbolDelete: boolean;
  /**
   * Transient (non-persisted): becomes true the first time we auto-open
   * the right panel for the active picmonic, so re-collapsing the panel
   * isn't fought by subsequent symbol adds. Resets on picmonic switch.
   * Excluded from persistence via [persist partialize].
   */
  autoOpenedRightForActivePicmonic: boolean;
  /**
   * Active canvas tool. Transient — reset to "select" on reload via the
   * persist partialize so a hot reload mid-trace doesn't dump the user
   * into a frozen lasso state.
   */
  canvasTool: CanvasTool;
  /**
   * When set, the canvas renders vertex-edit handles for this region
   * layer (must be a `kind === "region"` layer). Transient.
   */
  regionEditingId: string | null;
  /**
   * When set, the lasso tool will replace this region's polygon on commit
   * instead of creating a new SymbolLayer (the "Re-trace" affordance).
   * Cleared on commit, on tool exit, and on Escape.
   */
  retraceTargetId: string | null;
}

export interface UiSlice {
  ui: UiState;
  setLeftPanelSize: (size: number) => void;
  setRightPanelSize: (size: number) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleLeftCollapsed: () => void;
  toggleRightCollapsed: () => void;
  pushRecentSymbol: (ref: string) => void;
  setLastPlayerMode: (mode: PlayerMode) => void;
  setStorageQuota: (next: StorageQuotaState) => void;
  setConfirmSymbolDelete: (value: boolean) => void;
  /**
   * Open the right panel and mark it auto-opened, but only on the first
   * trigger per active picmonic. Subsequent calls are no-ops, so the user
   * can re-collapse without fighting the system. Reset on picmonic switch.
   */
  ensureRightPanelOpenedOnce: () => void;
  resetAutoOpenedRight: () => void;
  setCanvasTool: (tool: CanvasTool) => void;
  setRegionEditingId: (id: string | null) => void;
  setRetraceTargetId: (id: string | null) => void;
}

export const createUiSlice: StateCreator<RootState, [], [], UiSlice> = (set) => ({
  ui: {
    leftPanelSize: PANEL_DEFAULTS.leftSize,
    rightPanelSize: PANEL_DEFAULTS.rightSize,
    leftCollapsed: false,
    rightCollapsed: false,
    recentSymbolIds: [],
    lastPlayerMode: "hotspot",
    storageQuota: { percent: null, lastWarned: null },
    confirmSymbolDelete: true,
    autoOpenedRightForActivePicmonic: false,
    canvasTool: "select",
    regionEditingId: null,
    retraceTargetId: null,
  },
  setLeftPanelSize: (size) =>
    set((s) => ({ ui: { ...s.ui, leftPanelSize: size } })),
  setRightPanelSize: (size) =>
    set((s) => ({ ui: { ...s.ui, rightPanelSize: size } })),
  setLeftCollapsed: (collapsed) =>
    set((s) => ({ ui: { ...s.ui, leftCollapsed: collapsed } })),
  setRightCollapsed: (collapsed) =>
    set((s) => ({ ui: { ...s.ui, rightCollapsed: collapsed } })),
  toggleLeftCollapsed: () =>
    set((s) => ({ ui: { ...s.ui, leftCollapsed: !s.ui.leftCollapsed } })),
  toggleRightCollapsed: () =>
    set((s) => ({ ui: { ...s.ui, rightCollapsed: !s.ui.rightCollapsed } })),
  pushRecentSymbol: (ref) =>
    set((s) => ({
      ui: {
        ...s.ui,
        recentSymbolIds: [
          ref,
          ...s.ui.recentSymbolIds.filter((r) => r !== ref),
        ].slice(0, RECENT_SYMBOLS_MAX),
      },
    })),
  setLastPlayerMode: (mode) =>
    set((s) => ({ ui: { ...s.ui, lastPlayerMode: mode } })),
  setStorageQuota: (next) =>
    set((s) => ({ ui: { ...s.ui, storageQuota: next } })),
  setConfirmSymbolDelete: (value) =>
    set((s) => ({ ui: { ...s.ui, confirmSymbolDelete: value } })),
  ensureRightPanelOpenedOnce: () =>
    set((s) => {
      if (s.ui.autoOpenedRightForActivePicmonic) return s;
      return {
        ui: {
          ...s.ui,
          rightCollapsed: false,
          autoOpenedRightForActivePicmonic: true,
        },
      };
    }),
  resetAutoOpenedRight: () =>
    set((s) =>
      s.ui.autoOpenedRightForActivePicmonic
        ? { ui: { ...s.ui, autoOpenedRightForActivePicmonic: false } }
        : s,
    ),
  setCanvasTool: (tool) =>
    set((s) => {
      if (s.ui.canvasTool === tool) return s;
      // Switching tools clears any in-flight region edit / retrace target
      // so the user never sees vertex handles for a layer they can't reach.
      return {
        ui: {
          ...s.ui,
          canvasTool: tool,
          regionEditingId: tool === "select" ? s.ui.regionEditingId : null,
          retraceTargetId: tool === "lasso" ? s.ui.retraceTargetId : null,
        },
      };
    }),
  setRegionEditingId: (id) =>
    set((s) =>
      s.ui.regionEditingId === id ? s : { ui: { ...s.ui, regionEditingId: id } },
    ),
  setRetraceTargetId: (id) =>
    set((s) =>
      s.ui.retraceTargetId === id ? s : { ui: { ...s.ui, retraceTargetId: id } },
    ),
});
