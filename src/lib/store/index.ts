"use client";

import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  subscribeWithSelector,
} from "zustand/middleware";
import { temporal } from "zundo";
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
const HISTORY_LIMIT = 100;

interface HistorySlice {
  picmonics: RootState["picmonics"];
  currentPicmonicId: RootState["currentPicmonicId"];
}

function historyEqual(a: HistorySlice, b: HistorySlice): boolean {
  // Picmonic mutations create a new picmonics map ref. If neither the map ref
  // nor the active id changed, treat as no-op (don't push a snapshot).
  return a.picmonics === b.picmonics && a.currentPicmonicId === b.currentPicmonicId;
}

export const useStore = create<RootState>()(
  temporal(
    subscribeWithSelector(
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
            ui: {
              ...s.ui,
              autoOpenedRightForActivePicmonic: false,
              highlightAssetId: null,
            },
          }),
          version: STORE_VERSION,
          migrate: (state) => state as PersistedShape,
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
    ),
    {
      partialize: (state): HistorySlice => ({
        picmonics: state.picmonics,
        currentPicmonicId: state.currentPicmonicId,
      }),
      equality: historyEqual,
      limit: HISTORY_LIMIT,
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
