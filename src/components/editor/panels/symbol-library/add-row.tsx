"use client";

import { usePicmonic } from "@/lib/store/hooks";
import { AddSymbolCard } from "./add-symbol-card";
import { BackdropCard } from "./backdrop-card";

/**
 * Top-of-library section that pairs the "Add background" and "Add symbol"
 * controls. When no backdrop is set, the two cards sit side-by-side; once a
 * backdrop is set, BackdropCard expands to its full preview/opacity layout
 * and the symbol card drops to a compact row below it.
 */
export function AddRow() {
  const picmonic = usePicmonic();
  const hasBackdrop = !!picmonic?.canvas.backdrop?.uploadedBlobId;

  if (hasBackdrop) {
    return (
      <>
        <BackdropCard />
        <div className="border-b border-border bg-card/60 px-3 py-2.5">
          <AddSymbolCard variant="row" />
        </div>
      </>
    );
  }

  return (
    <div className="border-b border-border bg-card/60 px-3 py-2.5">
      <div className="grid grid-cols-2 gap-2">
        <BackdropCard compact />
        <AddSymbolCard />
      </div>
    </div>
  );
}
