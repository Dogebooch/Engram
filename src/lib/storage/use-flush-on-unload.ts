"use client";

import { useEffect } from "react";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { flushIndexPersist } from "@/lib/store/index-store";

/**
 * On `beforeunload`, synchronously flush any pending debounced writes so an
 * in-flight 500ms save (or 250ms index write) can't be dropped when the tab
 * closes. We don't `preventDefault()` — the goal is silent durability, not a
 * confirmation prompt. Both flushes are idempotent and fast.
 */
export function useFlushOnUnload(): void {
  useEffect(() => {
    const handler = () => {
      void flushPendingSave();
      void flushIndexPersist();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}
