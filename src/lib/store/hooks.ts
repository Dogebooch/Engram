"use client";

import { useStore } from "./index";
import type { Picmonic, SaveStatus } from "@/lib/types/picmonic";
import type { UiState } from "./slices/ui-slice";

export function usePicmonic(): Picmonic | null {
  return useStore((s) =>
    s.currentPicmonicId ? (s.picmonics[s.currentPicmonicId] ?? null) : null,
  );
}

export function useCurrentPicmonicId(): string | null {
  return useStore((s) => s.currentPicmonicId);
}

export function useSaveStatus(): SaveStatus {
  return useStore((s) => s.saveStatus);
}

export function useUiPrefs(): UiState {
  return useStore((s) => s.ui);
}
