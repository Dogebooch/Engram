"use client";

import { useEffect, useRef } from "react";
import { SAVE_DEBOUNCE_MS } from "@/lib/constants";
import { debounce, type DebouncedFn } from "@/lib/debounce";
import type { Picmonic } from "@/lib/types/picmonic";
import { useStore } from "./index";
import { saveCurrentPicmonicNow } from "./save-now";

const SAVED_LINGER_MS = 1500;

let pendingFlush: (() => void) | null = null;
let pendingCancel: (() => void) | null = null;

/**
 * Flush any debounce-pending save immediately. Used by ⌘S / File ▸ Save so
 * the explicit-save path doesn't race the timer. No-op if nothing is queued.
 */
export function flushPendingSave(): void {
  pendingFlush?.();
}

export function useDebouncedPicmonicSave(): void {
  const debouncedRef = useRef<DebouncedFn<[Picmonic]> | null>(null);

  useEffect(() => {
    let lingerTimer: ReturnType<typeof setTimeout> | null = null;

    const flushSavedToIdle = () => {
      if (lingerTimer) clearTimeout(lingerTimer);
      lingerTimer = setTimeout(() => {
        const s = useStore.getState();
        if (s.saveStatus === "saved") s.setSaveStatus("idle");
      }, SAVED_LINGER_MS);
    };

    debouncedRef.current = debounce(async (_p: Picmonic) => {
      const ok = await saveCurrentPicmonicNow();
      if (ok) flushSavedToIdle();
    }, SAVE_DEBOUNCE_MS);
    pendingFlush = () => debouncedRef.current?.flush();
    pendingCancel = () => debouncedRef.current?.cancel();

    // Fires only when the active picmonic's reference changes (Object.is on the
    // selected value). Unrelated dictionary mutations are skipped, and the initial
    // subscription doesn't fire — preserving the pre-refactor save semantics.
    const unsubscribe = useStore.subscribe(
      (state) =>
        state.currentPicmonicId
          ? state.picmonics[state.currentPicmonicId] ?? null
          : null,
      (current) => {
        if (!current) return;
        useStore.getState().setSaveStatus("saving");
        debouncedRef.current?.(current);
      },
    );

    return () => {
      unsubscribe();
      pendingCancel?.();
      pendingFlush = null;
      pendingCancel = null;
      if (lingerTimer) clearTimeout(lingerTimer);
    };
  }, []);
}
