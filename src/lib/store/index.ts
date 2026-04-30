"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { IDB_KEYS } from "@/lib/constants";
import { idbStateStorage } from "./persist";
import { createCanvasSlice } from "./slices/canvas-slice";
import { createInteractionsSlice } from "./slices/interactions-slice";
import { createPicmonicSlice } from "./slices/picmonic-slice";
import { createPlayerSlice } from "./slices/player-slice";
import { createSelectionSlice } from "./slices/selection-slice";
import { createUiSlice } from "./slices/ui-slice";
import type { RootState } from "./types";

interface PersistedShape {
  currentPicmonicId: RootState["currentPicmonicId"];
  ui: RootState["ui"];
}

const STORE_VERSION = 1;

export const useStore = create<RootState>()(
  persist(
    (...a) => ({
      ...createPicmonicSlice(...a),
      ...createUiSlice(...a),
      ...createSelectionSlice(...a),
      ...createCanvasSlice(...a),
      ...createInteractionsSlice(...a),
      ...createPlayerSlice(...a),
    }),
    {
      name: IDB_KEYS.uiPrefs,
      storage: createJSONStorage(() => idbStateStorage),
      partialize: (s): PersistedShape => ({
        currentPicmonicId: s.currentPicmonicId,
        ui: s.ui,
      }),
      version: STORE_VERSION,
      migrate: (state) => state as PersistedShape,
      // Deep-merge `ui` so newly added fields (e.g. recentSymbolIds) keep
      // their in-memory defaults when older persisted state lacks them.
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PersistedShape>;
        return {
          ...currentState,
          ...persisted,
          ui: { ...currentState.ui, ...(persisted.ui ?? {}) },
        } as RootState;
      },
    },
  ),
);

if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV !== "production"
) {
  (window as unknown as { __engramStore?: typeof useStore }).__engramStore =
    useStore;
}

export type { RootState };
