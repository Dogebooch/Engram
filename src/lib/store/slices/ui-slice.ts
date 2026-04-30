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
});
