"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import {
  loadSymbols,
  searchSymbols,
  type SymbolEntry,
} from "@/lib/symbols";
import {
  LibraryLoadingState,
  LibraryMissingIndexState,
  LibraryNoResultsState,
} from "./empty-state";
import { LibraryGrid } from "./library-grid";
import { LibrarySearch } from "./library-search";
import { RecentStrip } from "./recent-strip";

const RESULT_LIMIT = 250;
const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; symbols: SymbolEntry[] }
  | { kind: "missing" };

export function SymbolLibrary() {
  const [status, setStatus] = React.useState<LoadStatus>({ kind: "loading" });
  const [query, setQuery] = React.useState("");

  const addSymbol = useStore((s) => s.addSymbol);
  const recentIds = useStore((s) => s.ui.recentSymbolIds);
  const currentPicmonicId = useCurrentPicmonicId();

  React.useEffect(() => {
    let cancelled = false;
    loadSymbols()
      .then((symbols) => {
        if (cancelled) return;
        if (symbols.length === 0) setStatus({ kind: "missing" });
        else setStatus({ kind: "loaded", symbols });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const symbols = status.kind === "loaded" ? status.symbols : EMPTY_LIST;
  const byId = React.useMemo(() => {
    const m = new Map<string, SymbolEntry>();
    for (const s of symbols) m.set(s.id, s);
    return m;
  }, [symbols]);

  const recents = React.useMemo(() => {
    if (query.trim() !== "") return EMPTY_LIST;
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

  const handleActivate = React.useCallback(
    (entry: SymbolEntry) => {
      if (!currentPicmonicId) {
        toast.error("Create a Picmonic first", {
          description: "⌘/Ctrl+N or the + button up top.",
        });
        return;
      }
      addSymbol({ ref: entry.id, x: CENTER_X, y: CENTER_Y });
    },
    [addSymbol, currentPicmonicId],
  );

  const totalLabel =
    status.kind === "loaded"
      ? query.trim() === ""
        ? `${symbols.length}`
        : `${filtered.length} / ${symbols.length}`
      : null;

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Library
        </span>
        {totalLabel && (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {totalLabel}
          </span>
        )}
      </div>

      <div className="border-b border-border p-2">
        <LibrarySearch value={query} onChange={setQuery} />
      </div>

      {status.kind === "loading" && <LibraryLoadingState />}
      {status.kind === "missing" && <LibraryMissingIndexState />}
      {status.kind === "loaded" && (
        <>
          <RecentStrip entries={recents} onActivate={handleActivate} />
          {filtered.length === 0 ? (
            <LibraryNoResultsState query={query} />
          ) : (
            <div className="flex-1 min-h-0">
              <LibraryGrid entries={filtered} onActivate={handleActivate} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const EMPTY_LIST: SymbolEntry[] = [];
