"use client";

import { LayersIcon, ShapesIcon } from "lucide-react";

export function LeftPanel() {
  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Library
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground">
          <ShapesIcon className="size-4" />
        </div>
        <p className="text-sm font-medium text-foreground">Symbol library</p>
        <p className="max-w-[22ch] text-xs leading-relaxed text-muted-foreground">
          OpenMoji + Game-Icons grid lands here in Phase 2. Drag onto the canvas, or press
          <kbd className="mx-1 inline-flex h-4 items-center rounded border border-border bg-background px-1 font-mono text-[10px] text-foreground">
            /
          </kbd>
          to search.
        </p>
        <div className="mt-4 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
          <LayersIcon className="size-3" />
          <span>Layers · Phase 2</span>
        </div>
      </div>
    </div>
  );
}
