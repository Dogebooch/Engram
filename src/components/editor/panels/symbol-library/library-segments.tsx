"use client";

import * as React from "react";
import type { LibrarySegment } from "@/lib/store/slices/ui-slice";
import { cn } from "@/lib/utils";

interface LibrarySegmentsProps {
  value: LibrarySegment;
  onChange: (next: LibrarySegment) => void;
}

const SEGMENTS: { key: LibrarySegment; label: string }[] = [
  { key: "symbols", label: "Symbols" },
  { key: "backgrounds", label: "Backgrounds" },
];

export function LibrarySegments({ value, onChange }: LibrarySegmentsProps) {
  return (
    <div
      role="tablist"
      aria-label="Library section"
      className={cn(
        "relative mx-2 mt-2 grid grid-cols-2 gap-0.5 rounded-md p-0.5",
        "border border-border/60 bg-card/40",
      )}
    >
      {SEGMENTS.map((seg) => {
        const active = seg.key === value;
        return (
          <button
            key={seg.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(seg.key)}
            className={cn(
              "relative z-10 select-none truncate rounded-[4px] px-2 py-1.5",
              "font-mono text-[10px] uppercase tracking-[0.18em]",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
              active
                ? "bg-[var(--accent)]/10 text-foreground ring-1 ring-inset ring-[var(--accent)]/30"
                : "text-muted-foreground/70 hover:text-foreground",
            )}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
