import type { StateCreator } from "zustand";
import { PANEL_DEFAULTS } from "@/lib/constants";
import type { RootState } from "../types";

export interface UiState {
  leftPanelSize: number;
  rightPanelSize: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

export interface UiSlice {
  ui: UiState;
  setLeftPanelSize: (size: number) => void;
  setRightPanelSize: (size: number) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleLeftCollapsed: () => void;
  toggleRightCollapsed: () => void;
}

export const createUiSlice: StateCreator<RootState, [], [], UiSlice> = (set) => ({
  ui: {
    leftPanelSize: PANEL_DEFAULTS.leftSize,
    rightPanelSize: PANEL_DEFAULTS.rightSize,
    leftCollapsed: false,
    rightCollapsed: false,
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
});
