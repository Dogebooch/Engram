"use client";

import * as React from "react";
import { ShapesIcon, TriangleAlertIcon } from "lucide-react";

export function LibraryLoadingState() {
  return (
    <div className="flex-1 px-2 pt-1 pb-3">
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded-md border border-white/[0.03] bg-white/[0.02]"
            style={{ animationDelay: `${(i % 6) * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function LibraryMissingIndexState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-9 items-center justify-center rounded-full border border-destructive/40 bg-destructive/[0.08] text-destructive shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
        <TriangleAlertIcon className="size-4" />
      </div>
      <p className="text-sm font-medium text-foreground">Symbol index missing</p>
      <p className="max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
        Regenerate the OpenMoji index from your terminal:
      </p>
      <code className="rounded-md border border-border bg-background/80 px-2 py-1 font-mono text-[11px] text-foreground">
        npm run symbols:build
      </code>
      <p className="mt-1 max-w-[28ch] text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
        Then refresh this page
      </p>
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
        broader term — search hits names, aliases, and tags.
      </p>
    </div>
  );
}
