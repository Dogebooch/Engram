"use client";

import * as React from "react";
import type Konva from "konva";
import { captureThumbnail } from "@/lib/canvas/thumbnail";
import { useStore } from "@/lib/store";
import {
  entryFromPicmonic,
  useIndexStore,
} from "@/lib/store/index-store";

/**
 * Watch saveStatus transitions; when the active picmonic finishes a save,
 * snapshot the live stage and update its index entry.
 *
 * Captures on `saving → saved` (write succeeded) and on first mount if a
 * picmonic is already loaded with no thumb yet. Tag/name/factCount changes
 * still flow through even when the snapshot fails.
 */
export function useThumbnailCapture(
  stageRef: React.RefObject<Konva.Stage | null>,
): void {
  const lastStatusRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const upsert = useIndexStore.getState().upsertIndexEntry;

    const sync = (forceThumb: boolean) => {
      const s = useStore.getState();
      const id = s.currentPicmonicId;
      if (!id) return;
      const p = s.picmonics[id];
      if (!p) return;
      const stage = stageRef.current;
      const thumb = stage ? captureThumbnail(stage) : null;
      const existing = useIndexStore
        .getState()
        .index?.find((e) => e.id === id);
      const carryThumb =
        thumb ??
        (forceThumb ? null : existing?.thumbDataUrl ?? null);
      upsert(entryFromPicmonic(p, carryThumb));
    };

    const unsubscribe = useStore.subscribe((state) => {
      const status = state.saveStatus;
      const prev = lastStatusRef.current;
      lastStatusRef.current = status;
      if (prev === "saving" && status === "saved") {
        sync(false);
      }
    });

    // First mount: ensure index has a row for the current picmonic.
    sync(false);

    return () => {
      unsubscribe();
    };
  }, [stageRef]);
}
