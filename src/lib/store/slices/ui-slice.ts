import type { StateCreator } from "zustand";
import { PANEL_DEFAULTS, RECENT_SYMBOLS_MAX } from "@/lib/constants";
import type { RootState } from "../types";

export type PlayerMode = "hotspot" | "sequential";

export type LibrarySegment = "symbols" | "backgrounds";

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
   * Which segment of the left library panel is active. Persists across
   * sessions so authors return to the segment they last used.
   */
  librarySegment: LibrarySegment;
  /**
   * Transient (non-persisted): becomes true the first time we auto-open
   * the right panel for the active picmonic, so re-collapsing the panel
   * isn't fought by subsequent symbol adds. Resets on picmonic switch.
   * Excluded from persistence via [persist partialize].
   */
  autoOpenedRightForActivePicmonic: boolean;
  /**
   * Transient (non-persisted): when set, the matching background tile in
   * the Backgrounds grid scrolls into view and pulses an accent ring once.
   * Cleared after the grid consumes it.
   */
  highlightAssetId: string | null;
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
  setLibrarySegment: (seg: LibrarySegment) => void;
  setHighlightAssetId: (id: string | null) => void;
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
    librarySegment: "symbols",
    autoOpenedRightForActivePicmonic: false,
    highlightAssetId: null,
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
  setLibrarySegment: (seg) =>
    set((s) =>
      s.ui.librarySegment === seg
        ? s
        : { ui: { ...s.ui, librarySegment: seg } },
    ),
  setHighlightAssetId: (id) =>
    set((s) =>
      s.ui.highlightAssetId === id
        ? s
        : { ui: { ...s.ui, highlightAssetId: id } },
    ),
});
