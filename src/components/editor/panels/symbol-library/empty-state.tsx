"use client";

import * as React from "react";
import { ShapesIcon, TriangleAlertIcon } from "lucide-react";

export function LibraryLoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        Loading symbols…
      </div>
    </div>
  );
}

export function LibraryMissingIndexState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-9 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-4" />
      </div>
      <p className="text-sm font-medium text-foreground">Symbol index missing</p>
      <p className="max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
        The OpenMoji index couldn’t load. Regenerate it by running:
      </p>
      <code className="rounded-md border border-border bg-background/80 px-2 py-1 font-mono text-[11px] text-foreground">
        npm run symbols:build
      </code>
    </div>
  );
}

export function LibraryNoResultsState({ query }: { query: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex size-9 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground">
        <ShapesIcon className="size-4" />
      </div>
      <p className="text-sm font-medium text-foreground">No matches</p>
      <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
        Nothing for{" "}
        <span className="font-mono text-foreground">{`“${query}”`}</span>. Try a
        broader term.
      </p>
    </div>
  );
}
