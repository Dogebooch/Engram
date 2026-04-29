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
    <div className="border-b border-white/[0.06] px-2 pb-2 pt-2.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
          <ClockIcon className="size-2.5" />
          <span>Recent</span>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground/40">
          {entries.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out"
          >
            <LibraryCard entry={entry} size="small" onActivate={onActivate} />
          </div>
        ))}
      </div>
    </div>
  );
}
