"use client";

import * as React from "react";
import { EditorView } from "@codemirror/view";
import type { EditorView as EditorViewType } from "@codemirror/view";
import { useStore } from "@/lib/store";
import type { ParsedNotes } from "@/lib/notes/types";
import { setTransientHighlightEffect } from "./transient-highlight";

/**
 * Canvas → editor sync. Selecting a symbol on the canvas scrolls its bullet
 * into view and lights it. The glow pulses once then settles to a calm resting
 * tint (CSS `forwards`); we keep the decoration applied for the lifetime of the
 * selection so the "you are here" anchor persists while editing, and clear it
 * only when the selection empties.
 */
export function useSyncCanvasToEditor(
  view: EditorViewType | null,
  parsed: ParsedNotes,
): void {
  const selectedSymbolIds = useStore((s) => s.selectedSymbolIds);
  const lastSyncSource = useStore((s) => s.lastSyncSource);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);

  React.useEffect(() => {
    if (!view) return;
    if (selectedSymbolIds.length === 0) {
      view.dispatch({ effects: setTransientHighlightEffect.of(null) });
      return;
    }
    if (lastSyncSource === "editor") return;

    const targetUuid = selectedSymbolIds[0];
    const factIds = parsed.factsBySymbolId.get(targetUuid);
    if (!factIds || factIds.length === 0) return;

    let foundOffset: number | null = null;
    let foundLine: number | null = null;
    for (const factId of factIds) {
      const fact = parsed.factsById.get(factId);
      if (!fact) continue;
      const ref = fact.symbolRefs.find((r) => r.symbolId === targetUuid);
      if (!ref) continue;
      foundOffset = ref.start;
      foundLine = ref.bulletLine;
      break;
    }
    if (foundOffset == null || foundLine == null) return;

    const safeOffset = Math.min(foundOffset, view.state.doc.length);
    view.dispatch({
      selection: { anchor: safeOffset, head: safeOffset },
      effects: [
        EditorView.scrollIntoView(safeOffset, { y: "center" }),
        setTransientHighlightEffect.of({ line: foundLine }),
      ],
    });

    setLastSyncSource("canvas");
  }, [view, selectedSymbolIds, parsed, lastSyncSource, setLastSyncSource]);
}
