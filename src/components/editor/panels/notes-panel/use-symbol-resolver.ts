"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { getSymbolById, loadSymbols } from "@/lib/symbols";
import { symbolHasOutline } from "@/lib/canvas/symbol-outline";
import { isImageSymbolLayer } from "@/lib/types/canvas";
import {
  setSymbolChipOnHoverChange,
  setSymbolChipOnPointerDown,
  setSymbolChipResolver,
  type ResolvedSymbolChip,
} from "@/lib/notes/codemirror/sym-token-extension";
import { beginSymbolRowDragOrSelect } from "./symbol-row-drag";
import type { EditorView } from "@codemirror/view";

export function useSymbolResolver(view: EditorView | null): void {
  React.useEffect(() => {
    setSymbolChipResolver((uuid: string): ResolvedSymbolChip => {
      const s = useStore.getState();
      const cid = s.currentPicmonicId;
      const symbols = cid ? (s.picmonics[cid]?.canvas.symbols ?? []) : [];
      const layer = symbols.find((sy) => sy.id === uuid);
      if (!layer) {
        return { displayName: "missing", imageUrl: null, broken: true };
      }
      if (!isImageSymbolLayer(layer)) {
        return { displayName: "region", imageUrl: null, broken: false };
      }
      const entry = getSymbolById(layer.ref);
      if (!entry) {
        return { displayName: layer.ref, imageUrl: null, broken: false };
      }
      return {
        displayName: entry.displayName,
        imageUrl: entry.imageUrl,
        broken: false,
      };
    });

    setSymbolChipOnPointerDown((uuid, factId, event, resolved) => {
      beginSymbolRowDragOrSelect({
        symbolId: uuid,
        fromFactId: factId,
        event,
        label: resolved.displayName,
        imageUrl: resolved.imageUrl,
        onSelect: () => {
          const state = useStore.getState();
          state.setLastSyncSource("editor");
          state.setSelectedSymbolIds([uuid]);
          // No outline yet → offer to draw one for this existing bullet.
          const cid = state.currentPicmonicId;
          const layer = cid
            ? state.picmonics[cid]?.canvas.symbols.find((sy) => sy.id === uuid)
            : undefined;
          if (!symbolHasOutline(layer)) {
            state.requestOutlineConfirm(uuid);
          }
        },
      });
    });

    setSymbolChipOnHoverChange((uuid: string | null) => {
      const setHover = useStore.getState().setHoveredFact;
      // hovering a chip in editor → tag-style hover not yet wired to fact;
      // hover the symbol instead by using selection.hoveredFactId? Phase 4.
      // For Phase 3, just leave as no-op visual aid for chip itself.
      void uuid;
      void setHover;
    });
  }, []);

  // Force re-decoration when canvas symbols change (so broken ↔ resolved chips refresh).
  const symbolsKey = useStore((s) => {
    const cid = s.currentPicmonicId;
    if (!cid) return "";
    const symbols = s.picmonics[cid]?.canvas.symbols ?? [];
    return symbols.map((sy) => sy.id).join("|");
  });

  React.useEffect(() => {
    if (!view) return;
    view.dispatch({});
  }, [view, symbolsKey]);

  // Refresh chips once the symbol library cache populates so labels switch
  // from raw refs ("openmoji:1F9C2") to display names ("salt").
  React.useEffect(() => {
    if (!view) return;
    let cancelled = false;
    loadSymbols()
      .then(() => {
        if (cancelled) return;
        view.dispatch({});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view]);
}
