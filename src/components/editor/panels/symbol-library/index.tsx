"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import { parseNotes } from "@/lib/notes/parse";
import {
  getCachedSymbols,
  loadSymbols,
  searchSymbols,
  useSymbolsVersion,
  type SymbolEntry,
} from "@/lib/symbols";
import { loadUserAssets, useUserAssets } from "@/lib/user-assets";
import { AddRow } from "./add-row";
import {
  LibraryLoadingState,
  LibraryMissingIndexState,
  LibraryNoResultsState,
} from "./empty-state";
import { LibraryGrid } from "./library-grid";
import { LibrarySearch } from "./library-search";
import { RecentStrip } from "./recent-strip";
import { UploadDropZone } from "./upload-drop-zone";
import { UploadsSection } from "./uploads-section";

const RESULT_LIMIT = 250;
const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

type LoadStatus = "loading" | "loaded" | "missing";

export function SymbolLibrary() {
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [query, setQuery] = React.useState("");

  const recentIds = useStore((s) => s.ui.recentSymbolIds);
  const addTargetFactId = useStore((s) => s.addSymbolTargetFactId);
  const clearAddTarget = useStore((s) => s.clearAddSymbolTargetFact);
  const traceOnAdd = useStore((s) => s.ui.traceOnAdd);
  const toggleTraceOnAdd = useStore((s) => s.toggleTraceOnAdd);
  const currentPicmonicId = useCurrentPicmonicId();
  const notes = useStore((s) =>
    s.currentPicmonicId ? (s.picmonics[s.currentPicmonicId]?.notes ?? "") : "",
  );
  const symbolsVersion = useSymbolsVersion();
  const userAssets = useUserAssets();

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
    return getCachedSymbols() ?? EMPTY_LIST;
  }, [symbolsVersion]);

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

  const addTargetName = React.useMemo(() => {
    if (!addTargetFactId) return null;
    return parseNotes(notes).factsById.get(addTargetFactId)?.name ?? null;
  }, [addTargetFactId, notes]);

  const handleActivate = React.useCallback(
    (entry: SymbolEntry) => {
      if (!currentPicmonicId) {
        toast.error("Create a Picmonic first", {
          description: "⌘/Ctrl+N or the + button up top.",
        });
        return;
      }
      const id = addSymbolWithNoteSync({
        ref: entry.id,
        x: CENTER_X,
        y: CENTER_Y,
        targetFactId: addTargetFactId,
      });
      if (id && useStore.getState().ui.traceOnAdd) {
        useStore.getState().armSymbolForBuild(id);
      }
    },
    [addTargetFactId, currentPicmonicId],
  );

  const totalLabel =
    status === "loaded"
      ? query.trim() === ""
        ? `${symbols.length}`
        : `${filtered.length} / ${symbols.length}`
      : null;

  const showUploadsSection = status === "loaded" && query.trim() === "";

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Library
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTraceOnAdd}
            aria-pressed={traceOnAdd}
            title="Trace after adding: start a symbol's outline as soon as you place it (needs a background image)"
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors",
              traceOnAdd
                ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                : "border-border/70 text-muted-foreground/55 hover:text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-[5px] rounded-full",
                traceOnAdd ? "bg-amber-500" : "bg-muted-foreground/40",
              )}
            />
            trace
          </button>
          {totalLabel && (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {totalLabel}
            </span>
          )}
        </div>
      </div>

      <AddRow />

      {addTargetName && (
        <div className="eng-library-add-target">
          <span className="eng-library-add-target__label">add to</span>
          <span className="eng-library-add-target__name" title={addTargetName}>
            {addTargetName}
          </span>
          <button
            type="button"
            onClick={clearAddTarget}
            className="eng-library-add-target__clear"
          >
            cancel
          </button>
        </div>
      )}

      <div className="border-b border-border p-2">
        <LibrarySearch value={query} onChange={setQuery} />
      </div>

      {status === "loading" && <LibraryLoadingState />}
      {status === "missing" && <LibraryMissingIndexState />}
      {status === "loaded" && (
        <UploadDropZone>
          <RecentStrip entries={recents} onActivate={handleActivate} />
          {showUploadsSection && (
            <UploadsSection assets={userAssets} onActivate={handleActivate} />
          )}
          {filtered.length === 0 ? (
            <LibraryNoResultsState query={query} />
          ) : (
            <div className="flex flex-1 min-h-0 flex-col">
              {(recents.length > 0 ||
                (showUploadsSection && userAssets.length > 0)) && (
                <div className="px-3 pb-1 pt-2.5">
                  <span className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                    All
                  </span>
                </div>
              )}
              <div className="flex-1 min-h-0">
                <LibraryGrid entries={filtered} onActivate={handleActivate} />
              </div>
            </div>
          )}
        </UploadDropZone>
      )}
    </div>
  );
}

const EMPTY_LIST: SymbolEntry[] = [];
