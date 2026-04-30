"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TagFilterProps {
  allTags: string[];
  selected: ReadonlySet<string>;
  onToggle: (tag: string) => void;
  onClear: () => void;
}

export function TagFilter({
  allTags,
  selected,
  onToggle,
  onClear,
}: TagFilterProps) {
  if (allTags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        tags
      </span>
      {allTags.map((t) => {
        const isOn = selected.has(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            aria-pressed={isOn}
            className={cn(
              "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
              isOn
                ? "bg-accent/20 text-accent-foreground ring-1 ring-accent/40"
                : "border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
          >
            {t}
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
        >
          clear
        </button>
      )}
    </div>
  );
}
