"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { toast } from "sonner";
import { LibraryGrid } from "@/components/editor/panels/symbol-library/library-grid";
import { LibrarySearch } from "@/components/editor/panels/symbol-library/library-search";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import {
  loadSymbols,
  searchSymbols,
  type SymbolEntry,
} from "@/lib/symbols";
import { cn } from "@/lib/utils";

const RESULT_LIMIT = 250;
const EMPTY: SymbolEntry[] = [];

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; symbols: SymbolEntry[] }
  | { kind: "missing" };

let cache: SymbolEntry[] | null = null;

export function ReplaceSymbolPopover() {
  const replacePicker = useStore((s) => s.replacePicker);
  if (!replacePicker) return null;
  return <ReplaceSymbolPopoverInner key={replacePicker.symbolId} />;
}

function ReplaceSymbolPopoverInner() {
  const replacePicker = useStore((s) => s.replacePicker)!;
  const closeReplacePicker = useStore((s) => s.closeReplacePicker);
  const updateSymbol = useStore((s) => s.updateSymbol);
  const pushRecentSymbol = useStore((s) => s.pushRecentSymbol);
  const currentPicmonicId = useCurrentPicmonicId();
  const currentRef = useStore((s) => {
    if (!s.currentPicmonicId) return null;
    const p = s.picmonics[s.currentPicmonicId];
    if (!p) return null;
    const layer = p.canvas.symbols.find(
      (sy) => sy.id === replacePicker.symbolId,
    );
    return layer?.ref ?? null;
  });

  const [status, setStatus] = React.useState<LoadStatus>(() =>
    cache ? { kind: "loaded", symbols: cache } : { kind: "loading" },
  );
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (cache) return;
    let cancelled = false;
    loadSymbols()
      .then((symbols) => {
        if (cancelled) return;
        if (symbols.length === 0) {
          setStatus({ kind: "missing" });
        } else {
          cache = symbols;
          setStatus({ kind: "loaded", symbols });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const symbols = status.kind === "loaded" ? status.symbols : EMPTY;

  const filtered = React.useMemo(
    () => searchSymbols(symbols, query, { limit: RESULT_LIMIT }),
    [symbols, query],
  );

  const currentEntry = React.useMemo(() => {
    if (!currentRef) return null;
    return symbols.find((s) => s.id === currentRef) ?? null;
  }, [symbols, currentRef]);

  const handlePick = React.useCallback(
    (entry: SymbolEntry) => {
      if (!currentPicmonicId) {
        closeReplacePicker();
        return;
      }
      if (entry.id === currentRef) {
        closeReplacePicker();
        return;
      }
      updateSymbol(replacePicker.symbolId, { ref: entry.id });
      pushRecentSymbol(entry.id);
      closeReplacePicker();
      toast("Symbol replaced", {
        description: entry.displayName,
        duration: 1200,
      });
    },
    [
      closeReplacePicker,
      currentPicmonicId,
      currentRef,
      replacePicker.symbolId,
      updateSymbol,
      pushRecentSymbol,
    ],
  );

  const totalLabel =
    status.kind === "loaded"
      ? query.trim() === ""
        ? `${symbols.length}`
        : `${filtered.length} / ${symbols.length}`
      : null;

  // Virtual anchor that positions the popover at exact cursor coords.
  const virtualAnchor = React.useMemo(
    () => ({
      getBoundingClientRect: () =>
        ({
          x: replacePicker.x,
          y: replacePicker.y,
          left: replacePicker.x,
          top: replacePicker.y,
          right: replacePicker.x,
          bottom: replacePicker.y,
          width: 0,
          height: 0,
          toJSON() {
            return {};
          },
        }) as DOMRect,
    }),
    [replacePicker.x, replacePicker.y],
  );

  return (
    <Popover.Root
      open
      onOpenChange={(o) => {
        if (!o) closeReplacePicker();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={virtualAnchor}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="isolate z-50 outline-none"
        >
          <Popover.Popup
            data-slot="replace-symbol-popover"
            initialFocus={false}
            className={cn(
              "flex flex-col gap-0",
              "h-[420px] w-[360px]",
              "origin-(--transform-origin) rounded-md border border-border/80 bg-popover/95 text-popover-foreground",
              "shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6),0_2px_8px_-2px_rgba(0,0,0,0.5)]",
              "backdrop-blur-md",
              "outline-none",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              "transition-[opacity,transform,scale] duration-150 ease-out",
            )}
          >
            <header className="flex h-8 items-center justify-between gap-2 border-b border-border/60 px-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Replace symbol
              </span>
              <div className="flex items-center gap-2">
                {totalLabel && (
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {totalLabel}
                  </span>
                )}
                {currentEntry && (
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded border border-border/60 bg-white/[0.03]"
                    aria-label={`Currently: ${currentEntry.displayName}`}
                    title={`Currently: ${currentEntry.displayName}`}
                  >
                    <img
                      src={currentEntry.imageUrl}
                      alt=""
                      draggable={false}
                      className="size-4 object-contain opacity-80"
                    />
                  </span>
                )}
              </div>
            </header>

            <div className="border-b border-border/60 p-2">
              <LibrarySearch value={query} onChange={setQuery} />
            </div>

            {status.kind === "loading" && (
              <div className="flex flex-1 items-center justify-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  Loading…
                </span>
              </div>
            )}
            {status.kind === "missing" && (
              <div className="flex flex-1 items-center justify-center px-6 text-center">
                <span className="text-xs text-muted-foreground">
                  Symbol index missing. Run{" "}
                  <code className="font-mono">npm run symbols:build</code>.
                </span>
              </div>
            )}
            {status.kind === "loaded" && (
              <div className="flex min-h-0 flex-1 flex-col">
                {filtered.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center px-6 text-center">
                    <span className="text-xs text-muted-foreground">
                      No symbols match{" "}
                      <span className="font-mono text-foreground/80">
                        “{query}”
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1">
                    <LibraryGrid entries={filtered} onActivate={handlePick} />
                  </div>
                )}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
