"use client";

import { useEffect } from "react";
import { useStore } from "./index";
import type { RootState } from "./types";

interface Snapshot {
  cid: string | null;
  symCount: number;
  selCount: number;
}

function snapshot(state: RootState): Snapshot {
  const cid = state.currentPicmonicId;
  const symCount = cid ? state.picmonics[cid]?.canvas.symbols.length ?? 0 : 0;
  return { cid, symCount, selCount: state.selectedSymbolIds.length };
}

/**
 * Auto-open the right (notes) panel the first time the user adds a symbol
 * OR selects a symbol within the active picmonic. Reset on picmonic switch
 * so each scene gets one fresh "navigator opens for you" moment without
 * fighting the user when they re-collapse it.
 */
export function useAutoOpenRightPanel(): void {
  useEffect(() => {
    return useStore.subscribe(
      snapshot,
      (curr, prev) => {
        const state = useStore.getState();

        if (curr.cid !== prev.cid) {
          state.resetAutoOpenedRight();
          return;
        }

        const grew =
          curr.symCount > prev.symCount || curr.selCount > prev.selCount;
        if (
          grew &&
          curr.cid != null &&
          state.ui.rightCollapsed &&
          !state.ui.autoOpenedRightForActivePicmonic
        ) {
          state.ensureRightPanelOpenedOnce();
        }
      },
      {
        equalityFn: (a, b) =>
          a.cid === b.cid &&
          a.symCount === b.symCount &&
          a.selCount === b.selCount,
      },
    );
  }, []);
}
