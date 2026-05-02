"use client";

import { useEffect } from "react";
import { useStore } from "./index";

/**
 * Auto-open the right (notes) panel the first time the user adds a symbol
 * OR selects a symbol within the active picmonic. Reset on picmonic switch
 * so each scene gets one fresh "navigator opens for you" moment without
 * fighting the user when they re-collapse it.
 */
export function useAutoOpenRightPanel(): void {
  useEffect(() => {
    let prevPicmonicId = useStore.getState().currentPicmonicId;
    let prevSymbolCount = symbolCount(useStore.getState(), prevPicmonicId);
    let prevSelectionCount = useStore.getState().selectedSymbolIds.length;

    return useStore.subscribe((state) => {
      const cid = state.currentPicmonicId;

      if (cid !== prevPicmonicId) {
        state.resetAutoOpenedRight();
        prevPicmonicId = cid;
        prevSymbolCount = symbolCount(state, cid);
        prevSelectionCount = state.selectedSymbolIds.length;
        return;
      }

      const symCount = symbolCount(state, cid);
      const selCount = state.selectedSymbolIds.length;
      const grew = symCount > prevSymbolCount || selCount > prevSelectionCount;
      prevSymbolCount = symCount;
      prevSelectionCount = selCount;

      if (
        grew &&
        cid != null &&
        state.ui.rightCollapsed &&
        !state.ui.autoOpenedRightForActivePicmonic
      ) {
        state.ensureRightPanelOpenedOnce();
      }
    });
  }, []);
}

function symbolCount(
  state: ReturnType<typeof useStore.getState>,
  cid: string | null,
): number {
  if (!cid) return 0;
  return state.picmonics[cid]?.canvas.symbols.length ?? 0;
}
