"use client";

import * as React from "react";
import { ChevronDownIcon, LayersIcon, SearchIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { parseNotes } from "@/lib/notes/parse";
import { getSymbolById } from "@/lib/symbols";
import type { SymbolLayer } from "@/lib/types/canvas";

interface OutlinesPanelProps {
  symbols: readonly SymbolLayer[];
}

/**
 * Floating outline-list overlay (top-right of the canvas). Lists every
 * symbol layer with its display name and the first fact it's tagged with.
 * Click a row to select; double-click to scroll-into-view + center.
 *
 * Hidden until the user has 6+ outlines so it doesn't clutter shallow
 * scenes. Collapsed by default; toggle via the chip button.
 */
export function OutlinesPanel({ symbols }: OutlinesPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const picmonic = usePicmonic();
  const selectedIds = useStore((s) => s.selectedSymbolIds);
  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);

  const factByLayerId = React.useMemo(() => {
    const out = new Map<string, string>();
    if (!picmonic) return out;
    const parsed = parseNotes(picmonic.notes);
    for (const fact of parsed.factsById.values()) {
      if (!fact.name || fact.symbolRefs.length === 0) continue;
      for (const ref of fact.symbolRefs) {
        const symbolUuid = ref.symbolId.toLowerCase();
        if (!out.has(symbolUuid)) out.set(symbolUuid, fact.name);
      }
    }
    return out;
  }, [picmonic]);

  const items = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return symbols.map((sy, i) => {
      const entry = getSymbolById(sy.ref);
      const name = entry?.displayName ?? "(unknown symbol)";
      const fact = factByLayerId.get(sy.id.toLowerCase()) ?? null;
      return { layer: sy, index: i, name, fact };
    }).filter((row) => {
      if (!q) return true;
      const hay = `${row.name} ${row.fact ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [symbols, factByLayerId, query]);

  if (symbols.length < 6) return null;

  const selectedSet = new Set(selectedIds);

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-20 flex max-h-[60%] w-64 flex-col rounded-md border border-border/60 bg-card/85 shadow-lg backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-expanded={open}
      >
        <LayersIcon className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Outlines
        </span>
        <span className="font-mono text-[10px] tabular-nums text-foreground/80">
          {symbols.length}
        </span>
        <ChevronDownIcon
          className={`ml-auto size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <>
          <div className="border-t border-border/60 px-2 py-2">
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/70"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter outlines…"
                className="w-full rounded-sm border border-border/60 bg-background/40 py-1 pl-6 pr-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-accent/60 focus:outline-none"
              />
            </div>
          </div>
          <ul className="overflow-y-auto py-1">
            {items.length === 0 && (
              <li className="px-3 py-3 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/60">
                No matches
              </li>
            )}
            {items.map(({ layer, index, name, fact }) => {
              const sel = selectedSet.has(layer.id);
              return (
                <li key={layer.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (e.shiftKey) {
                        const set = new Set(selectedIds);
                        if (set.has(layer.id)) set.delete(layer.id);
                        else set.add(layer.id);
                        setSelectedSymbolIds([...set]);
                      } else {
                        setSelectedSymbolIds([layer.id]);
                      }
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                      sel ? "bg-accent/15 text-foreground" : ""
                    }`}
                  >
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70 w-6 shrink-0 text-right">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate text-xs font-medium text-foreground">
                      {name}
                    </span>
                    {fact && (
                      <span className="shrink-0 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        {fact}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
