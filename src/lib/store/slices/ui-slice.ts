import type { StateCreator } from "zustand";
import { PANEL_DEFAULTS, RECENT_SYMBOLS_MAX } from "@/lib/constants";
import type { RootState } from "../types";

export type PlayerMode = "hotspot" | "sequential";

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
   * Persisted preference: when true, adding a symbol immediately arms outline
   * drawing for it (place → trace → describe in one motion). Off by default so
   * dropping art onto a blank stage isn't interrupted.
   */
  traceOnAdd: boolean;
  /**
   * Persisted preference: when true, the editor canvas shows a small numbered
   * circle for each symbol (its chronological fact number) instead of the full
   * muted outline, which is quieter over a backdrop. The full outline still
   * appears for the hovered/selected symbol. On by default.
   */
  showSymbolNumbers: boolean;
  /**
   * Transient (non-persisted): becomes true the first time we auto-open
   * the right panel for the active picmonic, so re-collapsing the panel
   * isn't fought by subsequent symbol adds. Resets on picmonic switch.
   * Excluded from persistence via [persist partialize].
   */
  autoOpenedRightForActivePicmonic: boolean;
  /**
   * Transient (non-persisted): set to a Picmonic id by `createPicmonic` so the
   * topbar title can auto-enter its rename state once, then clears itself.
   */
  justCreatedPicmonicId: string | null;
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
  toggleTraceOnAdd: () => void;
  toggleSymbolNumbers: () => void;
  /**
   * Open the right panel and mark it auto-opened, but only on the first
   * trigger per active picmonic. Subsequent calls are no-ops, so the user
   * can re-collapse without fighting the system. Reset on picmonic switch.
   */
  ensureRightPanelOpenedOnce: () => void;
  resetAutoOpenedRight: () => void;
  clearJustCreatedPicmonic: () => void;
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
    traceOnAdd: false,
    showSymbolNumbers: true,
    autoOpenedRightForActivePicmonic: false,
    justCreatedPicmonicId: null,
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
  toggleTraceOnAdd: () =>
    set((s) => ({ ui: { ...s.ui, traceOnAdd: !s.ui.traceOnAdd } })),
  toggleSymbolNumbers: () =>
    set((s) => ({ ui: { ...s.ui, showSymbolNumbers: !s.ui.showSymbolNumbers } })),
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
  clearJustCreatedPicmonic: () =>
    set((s) =>
      s.ui.justCreatedPicmonicId === null
        ? s
        : { ui: { ...s.ui, justCreatedPicmonicId: null } },
    ),
});
