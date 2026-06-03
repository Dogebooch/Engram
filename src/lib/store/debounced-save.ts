"use client";

import { useEffect, useRef } from "react";
import { SAVE_DEBOUNCE_MS } from "@/lib/constants";
import { debounce, type DebouncedFn } from "@/lib/debounce";
import { writeCrashMirror } from "@/lib/storage/crash-mirror";
import { useStore } from "./index";
import { saveCurrentPicmonicNow } from "./save-now";

const SAVED_LINGER_MS = 1500;

let pendingFlush: (() => void) | null = null;
let pendingCancel: (() => void) | null = null;
let inFlightSave: Promise<void> | null = null;

/**
 * Flush any debounce-pending save immediately and await its completion.
 * Used by ⌘S / File ▸ Save and by navigation (brand-button → home) so neither
 * the explicit-save path nor a route change races the debounce.
 */
export async function flushPendingSave(): Promise<void> {
  pendingFlush?.();
  if (inFlightSave) await inFlightSave;
}

export function useDebouncedPicmonicSave(): void {
  const debouncedRef = useRef<DebouncedFn<[]> | null>(null);

  useEffect(() => {
    let lingerTimer: ReturnType<typeof setTimeout> | null = null;

    const flushSavedToIdle = () => {
      if (lingerTimer) clearTimeout(lingerTimer);
      lingerTimer = setTimeout(() => {
        const s = useStore.getState();
        if (s.saveStatus === "saved") s.setSaveStatus("idle");
      }, SAVED_LINGER_MS);
    };

    debouncedRef.current = debounce(() => {
      const task = (async () => {
        const ok = await saveCurrentPicmonicNow();
        if (ok) flushSavedToIdle();
      })();
      inFlightSave = task;
      void task.finally(() => {
        if (inFlightSave === task) inFlightSave = null;
      });
    }, SAVE_DEBOUNCE_MS);
    pendingFlush = () => debouncedRef.current?.flush();
    pendingCancel = () => debouncedRef.current?.cancel();

    const unsubscribe = useStore.subscribe(
      (state) =>
        state.currentPicmonicId
          ? state.picmonics[state.currentPicmonicId] ?? null
          : null,
      (current) => {
        if (!current) return;
        // Sync mirror to localStorage before the IDB debounce so a tab kill
        // inside the debounce window still has the latest state recoverable.
        writeCrashMirror(current);
        useStore.getState().setSaveStatus("saving");
        debouncedRef.current?.();
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
