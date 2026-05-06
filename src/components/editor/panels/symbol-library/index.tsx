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
import { BackgroundsGrid } from "./backgrounds-grid";
import {
  LibraryLoadingState,
  LibraryMissingIndexState,
  LibraryNoResultsState,
} from "./empty-state";
import { LibraryGrid } from "./library-grid";
import { LibrarySearch } from "./library-search";
import { LibrarySegments } from "./library-segments";
import { RecentStrip } from "./recent-strip";
import { UploadButton } from "./upload-button";
import { UploadsBackgroundButton } from "./upload-backgrounds-button";
import { UploadDropZone } from "./upload-drop-zone";
import { UploadsSection } from "./uploads-section";

const RESULT_LIMIT = 250;
const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

type LoadStatus = "loading" | "loaded" | "missing";

export function SymbolLibrary() {
  const [status, setStatus] = React.useState<LoadStatus>("loading");
  const [symbolsQuery, setSymbolsQuery] = React.useState("");
  const [bgQuery, setBgQuery] = React.useState("");

  const recentIds = useStore((s) => s.ui.recentSymbolIds);
  const segment = useStore((s) => s.ui.librarySegment);
  const setSegment = useStore((s) => s.setLibrarySegment);
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
    return getCachedSymbols() ?? EMPTY_SYMBOL_LIST;
  }, [symbolsVersion]);

  const symbolUploads = React.useMemo(
    () => userAssets.filter((a) => a.kind === "symbol"),
    [userAssets],
  );
  const backgroundAssets = React.useMemo(
    () => userAssets.filter((a) => a.kind === "background"),
    [userAssets],
  );

  const byId = React.useMemo(() => {
    const m = new Map<string, SymbolEntry>();
    for (const s of symbols) m.set(s.id, s);
    return m;
  }, [symbols]);

  const recents = React.useMemo(() => {
    if (symbolsQuery.trim() !== "") return EMPTY_SYMBOL_LIST;
    const out: SymbolEntry[] = [];
    for (const id of recentIds) {
      const e = byId.get(id);
      if (e) out.push(e);
    }
    return out;
  }, [recentIds, byId, symbolsQuery]);

  const filtered = React.useMemo(
    () => searchSymbols(symbols, symbolsQuery, { limit: RESULT_LIMIT }),
    [symbols, symbolsQuery],
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

  const totalLabel = React.useMemo(() => {
    if (status !== "loaded") return null;
    if (segment === "symbols") {
      return symbolsQuery.trim() === ""
        ? `${symbols.length}`
        : `${filtered.length} / ${symbols.length}`;
    }
    return `${backgroundAssets.length}`;
  }, [
    status,
    segment,
    symbolsQuery,
    symbols.length,
    filtered.length,
    backgroundAssets.length,
  ]);

  const showUploadsSection =
    segment === "symbols" && status === "loaded" && symbolsQuery.trim() === "";

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
          {segment === "symbols" ? <UploadButton /> : <UploadsBackgroundButton />}
        </div>
      </div>

      <LibrarySegments value={segment} onChange={setSegment} />

      <div className="border-b border-border p-2">
        <LibrarySearch
          value={segment === "symbols" ? symbolsQuery : bgQuery}
          onChange={segment === "symbols" ? setSymbolsQuery : setBgQuery}
        />
      </div>

      {segment === "symbols" && (
        <>
          {status === "loading" && <LibraryLoadingState />}
          {status === "missing" && <LibraryMissingIndexState />}
          {status === "loaded" && (
            <UploadDropZone>
              <RecentStrip entries={recents} onActivate={handleActivate} />
              {showUploadsSection && (
                <UploadsSection
                  assets={symbolUploads}
                  onActivate={handleActivate}
                />
              )}
              {filtered.length === 0 ? (
                <LibraryNoResultsState query={symbolsQuery} />
              ) : (
                <div className="flex flex-1 min-h-0 flex-col">
                  {(recents.length > 0 ||
                    (showUploadsSection && symbolUploads.length > 0)) && (
                    <div className="px-3 pb-1 pt-2.5">
                      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                        All
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <LibraryGrid
                      entries={filtered}
                      onActivate={handleActivate}
                    />
                  </div>
                </div>
              )}
            </UploadDropZone>
          )}
        </>
      )}

      {segment === "backgrounds" && (
        <BackgroundsGrid assets={backgroundAssets} query={bgQuery} />
      )}
    </div>
  );
}

const EMPTY_SYMBOL_LIST: SymbolEntry[] = [];
