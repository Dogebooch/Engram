"use client";

import * as React from "react";
import type Konva from "konva";

/**
 * Module-level ref to the live editor Konva.Stage. Set by `<CanvasStage />`
 * on mount, cleared on unmount. Read by:
 *   - `useThumbnailCapture` to snapshot the stage on save.
 *   - Topbar Export menu (PNG / Bundle .zip).
 */
let currentStage: Konva.Stage | null = null;
const listeners = new Set<() => void>();

export function setCurrentStage(stage: Konva.Stage | null): void {
  if (currentStage === stage) return;
  currentStage = stage;
  for (const l of listeners) l();
}

export function getCurrentStage(): Konva.Stage | null {
  return currentStage;
}

export function useCurrentStage(): Konva.Stage | null {
  const subscribe = React.useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return React.useSyncExternalStore(subscribe, getCurrentStage, () => null);
}
