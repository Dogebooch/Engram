"use client";

import { useEffect, useRef } from "react";
import { set as idbSet } from "idb-keyval";
import { picmonicKey, SAVE_DEBOUNCE_MS } from "@/lib/constants";
import { debounce, type DebouncedFn } from "@/lib/debounce";
import type { Picmonic } from "@/lib/types/picmonic";
import { useStore } from "./index";

const SAVED_LINGER_MS = 1500;

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

    debouncedRef.current = debounce(async (p: Picmonic) => {
      try {
        await idbSet(picmonicKey(p.id), p);
        const s = useStore.getState();
        if (s.currentPicmonicId === p.id) {
          s.setSaveStatus("saved");
          flushSavedToIdle();
        }
      } catch (err) {
        console.error("[engram] save failed", err);
        useStore.getState().setSaveStatus("error");
      }
    }, SAVE_DEBOUNCE_MS);

    let lastSeen: Picmonic | null = null;
    const initial = useStore.getState();
    if (initial.currentPicmonicId) {
      lastSeen = initial.picmonics[initial.currentPicmonicId] ?? null;
    }

    const unsubscribe = useStore.subscribe((state) => {
      const id = state.currentPicmonicId;
      if (!id) {
        lastSeen = null;
        return;
      }
      const current = state.picmonics[id];
      if (!current || current === lastSeen) return;
      lastSeen = current;
      state.setSaveStatus("saving");
      debouncedRef.current?.(current);
    });

    return () => {
      unsubscribe();
      debouncedRef.current?.cancel();
      if (lingerTimer) clearTimeout(lingerTimer);
    };
  }, []);
}
