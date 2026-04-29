"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { IDB_KEYS } from "@/lib/constants";
import { idbStateStorage } from "./persist";
import { createPicmonicSlice } from "./slices/picmonic-slice";
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
    },
  ),
);

export type { RootState };
