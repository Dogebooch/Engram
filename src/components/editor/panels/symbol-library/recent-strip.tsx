"use client";

import * as React from "react";
import { ClockIcon } from "lucide-react";
import type { SymbolEntry } from "@/lib/symbols";
import { LibraryCard } from "./library-card";

interface RecentStripProps {
  entries: SymbolEntry[];
  onActivate: (entry: SymbolEntry) => void;
}

export function RecentStrip({ entries, onActivate }: RecentStripProps) {
  if (entries.length === 0) return null;

  return (
    <div className="border-b border-border px-2 pb-2 pt-1.5">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
        <ClockIcon className="size-2.5" />
        <span>Recent</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {entries.map((entry) => (
          <LibraryCard
            key={entry.id}
            entry={entry}
            size="small"
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  );
}
