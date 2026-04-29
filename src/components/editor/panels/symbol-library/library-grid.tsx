"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SymbolEntry } from "@/lib/symbols";
import { LibraryCard } from "./library-card";

const MIN_CELL_WIDTH = 68;
const ROW_GAP = 4;
const HORIZONTAL_PADDING = 16; // px-2 on each side

interface LibraryGridProps {
  entries: SymbolEntry[];
  onActivate: (entry: SymbolEntry) => void;
}

export function LibraryGrid({ entries, onActivate }: LibraryGridProps) {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = React.useState(3);

  React.useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const compute = (cw: number) => {
      const usable = Math.max(0, cw - HORIZONTAL_PADDING);
      const cols = Math.max(2, Math.floor(usable / MIN_CELL_WIDTH));
      setColumns(cols);
    };
    compute(el.getBoundingClientRect().width);
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      compute(entry.contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const rowCount = Math.ceil(entries.length / columns);
  const rowHeight = MIN_CELL_WIDTH + ROW_GAP + 8;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  return (
    <div
      ref={parentRef}
      className="relative h-full overflow-y-auto overflow-x-hidden px-2 pb-3 pt-1"
    >
      <div
        style={{ height: rowVirtualizer.getTotalSize(), width: "100%" }}
        className="relative"
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * columns;
          const rowEntries = entries.slice(startIdx, startIdx + columns);
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 right-0 grid gap-1"
              style={{
                top: 0,
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {rowEntries.map((entry) => (
                <LibraryCard
                  key={entry.id}
                  entry={entry}
                  onActivate={onActivate}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
