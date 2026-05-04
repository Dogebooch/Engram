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
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import {
  getCachedSymbols,
  loadSymbols,
  searchSymbols,
  useSymbolsVersion,
  type SymbolEntry,
} from "@/lib/symbols";
import { loadUserAssets, useUserAssets } from "@/lib/user-assets";
import {
  LibraryLoadingState,
  LibraryMissingIndexState,
  LibraryNoResultsState,
} from "./empty-state";
import { LibraryGrid } from "./library-grid";
import { LibrarySearch } from "./library-search";
import { RecentStrip } from "./recent-strip";
import { UploadButton } from "./upload-button";
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
  const currentPicmonicId = useCurrentPicmonicId();
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

  const handleActivate = React.useCallback(
    (entry: SymbolEntry) => {
      if (!currentPicmonicId) {
        toast.error("Create a Picmonic first", {
          description: "⌘/Ctrl+N or the + button up top.",
        });
        return;
      }
      addSymbolWithNoteSync({ ref: entry.id, x: CENTER_X, y: CENTER_Y });
    },
    [currentPicmonicId],
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
          {totalLabel && (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {totalLabel}
            </span>
          )}
          <UploadButton />
        </div>
      </div>

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
