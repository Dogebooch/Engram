"use client";

import { Plus } from "lucide-react";

interface OutlineEmptyProps {
  onAddSection: () => void;
  onAddFact: () => void;
}

/** Button-driven empty state — no markdown to hand-type. */
export function OutlineEmpty({ onAddSection, onAddFact }: OutlineEmptyProps) {
  return (
    <div className="flex flex-col items-start gap-3 px-1 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/55">
        Start your outline
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAddSection}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground/80 transition-colors hover:border-accent/45 hover:bg-accent/[0.07]"
        >
          <Plus className="size-3 text-accent/70" />
          section
        </button>
        <button
          type="button"
          onClick={onAddFact}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground/80 transition-colors hover:border-accent/45 hover:bg-accent/[0.07]"
        >
          <Plus className="size-3 text-accent/70" />
          fact
        </button>
      </div>
      <p className="max-w-[34ch] font-mono text-[10px] leading-relaxed text-muted-foreground/45">
        Sections group facts. Each fact holds symbols, and every symbol gets a
        visual description, a meaning, and a why.
      </p>
    </div>
  );
}
