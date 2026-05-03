"use client";

import * as React from "react";
import { useStore as useZustand } from "zustand";
import type { StoreApi } from "zustand";
import type { TemporalState } from "zundo";
import { useStore } from "./index";
import type { RootState } from "./types";

export interface HistorySlice {
  picmonics: RootState["picmonics"];
  currentPicmonicId: RootState["currentPicmonicId"];
}

function temporalStore(): StoreApi<TemporalState<HistorySlice>> {
  return (
    useStore as unknown as { temporal: StoreApi<TemporalState<HistorySlice>> }
  ).temporal;
}

export function getTemporal(): TemporalState<HistorySlice> {
  return temporalStore().getState();
}

export function pauseHistory(): void {
  getTemporal().pause();
}

export function resumeHistory(): void {
  getTemporal().resume();
}

export function clearHistory(): void {
  getTemporal().clear();
}

export function useTemporal<T>(
  selector: (state: TemporalState<HistorySlice>) => T,
): T {
  return useZustand(temporalStore(), selector);
}

export function useUndoRedo(): {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
} {
  const canUndo = useTemporal((s) => s.pastStates.length > 0);
  const canRedo = useTemporal((s) => s.futureStates.length > 0);
  const undo = React.useCallback(() => getTemporal().undo(), []);
  const redo = React.useCallback(() => getTemporal().redo(), []);
  return { canUndo, canRedo, undo, redo };
}
