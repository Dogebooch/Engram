"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { toast } from "sonner";
import { LibraryGrid } from "@/components/editor/panels/symbol-library/library-grid";
import { LibrarySearch } from "@/components/editor/panels/symbol-library/library-search";
import { RecentStrip } from "@/components/editor/panels/symbol-library/recent-strip";
import { UploadsSection } from "@/components/editor/panels/symbol-library/uploads-section";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import {
  getCachedSymbols,
  loadSymbols,
  searchSymbols,
  useSymbolsVersion,
  type SymbolEntry,
} from "@/lib/symbols";
import { loadUserAssets, useUserAssets } from "@/lib/user-assets";
import { isImageSymbolLayer } from "@/lib/types/canvas";
import { cn } from "@/lib/utils";

const RESULT_LIMIT = 250;
const EMPTY: SymbolEntry[] = [];

type LoadStatus = "loading" | "loaded" | "missing";

export function ReplaceSymbolPopover() {
  const replacePicker = useStore((s) => s.replacePicker);
  if (!replacePicker) return null;
  return <ReplaceSymbolPopoverInner key={replacePicker.symbolId} />;
}

function ReplaceSymbolPopoverInner() {
  const replacePicker = useStore((s) => s.replacePicker)!;
  const closeReplacePicker = useStore((s) => s.closeReplacePicker);
  const assignSymbolImage = useStore((s) => s.assignSymbolImage);
  const recentIds = useStore((s) => s.ui.recentSymbolIds);
  const currentPicmonicId = useCurrentPicmonicId();
  const symbolsVersion = useSymbolsVersion();
  const userAssets = useUserAssets();
  const currentRef = useStore((s) => {
    if (!s.currentPicmonicId) return null;
    const p = s.picmonics[s.currentPicmonicId];
    if (!p) return null;
    const layer = p.canvas.symbols.find(
      (sy) => sy.id === replacePicker.symbolId,
    );
    return layer && isImageSymbolLayer(layer) ? layer.ref : null;
  });

  const [status, setStatus] = React.useState<LoadStatus>(() =>
    getCachedSymbols() ? "loaded" : "loading",
  );
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    loadSymbols()
      .then(async (symbols) => {
        if (cancelled) return;
        if (symbols.length === 0) {
          setStatus("missing");
          return;
        }
        setStatus("loaded");
        try {
          await loadUserAssets();
        } catch (err) {
          console.warn("[engram] user assets failed to load", err);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const symbols = React.useMemo(() => {
    void symbolsVersion;
    return getCachedSymbols() ?? EMPTY;
  }, [symbolsVersion]);

  const byId = React.useMemo(() => {
    const m = new Map<string, SymbolEntry>();
    for (const s of symbols) m.set(s.id, s);
    return m;
  }, [symbols]);

  const recents = React.useMemo(() => {
    if (query.trim() !== "") return EMPTY;
    const out: SymbolEntry[] = [];
    for (const id of recentIds) {
      const e = byId.get(id);
      if (e) out.push(e);
    }
    return out;
  }, [recentIds, byId, query]);

  const filtered = React.useMemo(
    () => searchSymbols(symbols, query, { limit: RESULT_LIMIT }),
    [symbols, query],
  );

  const currentEntry = React.useMemo(() => {
    if (!currentRef) return null;
    return byId.get(currentRef) ?? null;
  }, [byId, currentRef]);

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
      assignSymbolImage(replacePicker.symbolId, entry.id);
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
      assignSymbolImage,
    ],
  );

  const totalLabel =
    status === "loaded"
      ? query.trim() === ""
        ? `${symbols.length}`
        : `${filtered.length} / ${symbols.length}`
      : null;

  const showStrips = status === "loaded" && query.trim() === "";

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
              "shadow-[0_10px_30px_-10px_color-mix(in_oklch,var(--background)_76%,transparent),0_2px_8px_-2px_color-mix(in_oklch,var(--background)_62%,transparent)]",
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
                    className="flex size-6 shrink-0 items-center justify-center rounded border border-border/60 bg-card/45"
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

            {status === "loading" && (
              <div className="flex flex-1 items-center justify-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  Loading…
                </span>
              </div>
            )}
            {status === "missing" && (
              <div className="flex flex-1 items-center justify-center px-6 text-center">
                <span className="text-xs text-muted-foreground">
                  Symbol index missing. Run{" "}
                  <code className="font-mono">npm run symbols:build</code>.
                </span>
              </div>
            )}
            {status === "loaded" && (
              <div className="flex min-h-0 flex-1 flex-col">
                {showStrips && (
                  <>
                    <RecentStrip entries={recents} onActivate={handlePick} />
                    <UploadsSection assets={userAssets} onActivate={handlePick} />
                  </>
                )}
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
                  <div className="flex min-h-0 flex-1 flex-col">
                    {showStrips &&
                      (recents.length > 0 || userAssets.length > 0) && (
                        <div className="px-3 pb-1 pt-2.5">
                          <span className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                            All
                          </span>
                        </div>
                      )}
                    <div className="min-h-0 flex-1">
                      <LibraryGrid entries={filtered} onActivate={handlePick} />
                    </div>
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
