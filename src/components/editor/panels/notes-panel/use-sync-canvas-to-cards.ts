"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { ParsedNotes } from "@/lib/notes/types";

const PULSE_FADE_MS = 850;

/**
 * When the canvas selection changes (with `lastSyncSource === "canvas"`),
 * scroll the matching fact card into view and pulse it for ~850ms. Mirrors
 * `useSyncCanvasToEditor` for the cards panel.
 */
export function useSyncCanvasToCards(parsed: ParsedNotes): void {
  const selectedSymbolIds = useStore((s) => s.selectedSymbolIds);
  const lastSyncSource = useStore((s) => s.lastSyncSource);

  const fadeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (selectedSymbolIds.length === 0) return;
    if (lastSyncSource !== "canvas") return;

    const targetUuid = selectedSymbolIds[0];
    const factIds = parsed.factsBySymbolId.get(targetUuid);
    if (!factIds || factIds.length === 0) return;
    const factId = factIds[0];

    const node = document.querySelector<HTMLElement>(
      `[data-fact-id="${CSS.escape(factId)}"]`,
    );
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.setAttribute("data-pulse", "");

    if (fadeTimerRef.current != null) {
      window.clearTimeout(fadeTimerRef.current);
    }
    fadeTimerRef.current = window.setTimeout(() => {
      node.removeAttribute("data-pulse");
      fadeTimerRef.current = null;
    }, PULSE_FADE_MS);
  }, [selectedSymbolIds, parsed, lastSyncSource]);

  React.useEffect(() => {
    return () => {
      if (fadeTimerRef.current != null) {
        window.clearTimeout(fadeTimerRef.current);
      }
    };
  }, []);
}
