"use client";

import * as React from "react";
import { toast } from "sonner";
import { SearchIcon, XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import {
  insertSymbolBullet,
  replaceSymbolUuid,
} from "@/lib/notes/insert";
import {
  loadSymbols,
  searchSymbols,
  type SymbolEntry,
} from "@/lib/symbols";
import { LibraryGrid } from "../panels/symbol-library/library-grid";
import { RecentStrip } from "../panels/symbol-library/recent-strip";

const RESULT_LIMIT = 250;
const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

const EYEBROW: Record<
  "swap-broken" | "replace" | "add-to-fact",
  string
> = {
  "swap-broken": "Replace missing symbol",
  replace: "Replace symbol",
  "add-to-fact": "Add symbol",
};

const EMPTY_SYMS: SymbolEntry[] = [];

/**
 * Shared symbol-library picker for three flows:
 *   1. swap-broken — chip's UUID is preserved; spawns a canvas symbol with
 *      `{ id: chipUuid, ref: pickedRef }`. Chip stops rendering as missing.
 *   2. replace — chip's UUID is rewritten to a freshly-spawned canvas
 *      symbol's id via `replaceSymbolUuid`.
 *   3. add-to-fact — spawns a new canvas symbol AND appends a bullet under
 *      the given fact via `insertSymbolBullet`.
 *
 * Click a tile = commit. No confirm button. Esc closes. Search auto-focuses.
 */
export function SymbolPicker() {
  const picker = useStore((s) => s.symbolPicker);
  const closePicker = useStore((s) => s.closeSymbolPicker);
  const addSymbol = useStore((s) => s.addSymbol);
  const setNotes = useStore((s) => s.setNotes);
  const pushRecentSymbol = useStore((s) => s.pushRecentSymbol);
  const recentIds = useStore((s) => s.ui.recentSymbolIds);
  const currentPicmonicId = useStore((s) => s.currentPicmonicId);

  const open = picker !== null;

  const [query, setQuery] = React.useState("");
  const [symbols, setSymbols] = React.useState<SymbolEntry[]>(EMPTY_SYMS);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    let cancelled = false;
    loadSymbols()
      .then((data) => {
        if (cancelled) return;
        setSymbols(data);
      })
      .catch(() => {
        if (!cancelled) setSymbols(EMPTY_SYMS);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Focus the search input when the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const byId = React.useMemo(() => {
    const m = new Map<string, SymbolEntry>();
    for (const s of symbols) m.set(s.id, s);
    return m;
  }, [symbols]);

  const recents = React.useMemo(() => {
    if (query.trim() !== "") return EMPTY_SYMS;
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
      if (!picker) return;
      if (!currentPicmonicId) {
        toast.error("No active picmonic");
        closePicker();
        return;
      }

      pushRecentSymbol(entry.id);

      if (picker.mode === "swap-broken") {
        // Spawn a canvas symbol whose id matches the existing chip's UUID
        // so the broken chip immediately resolves.
        addSymbol({
          id: picker.chipUuid,
          ref: entry.id,
          x: CENTER_X,
          y: CENTER_Y,
        });
        toast("Symbol replaced", {
          description: entry.displayName,
          duration: 1400,
        });
        closePicker();
        return;
      }

      if (picker.mode === "replace") {
        const newLayerId = addSymbol({
          ref: entry.id,
          x: CENTER_X,
          y: CENTER_Y,
        });
        if (!newLayerId) {
          closePicker();
          return;
        }
        const state = useStore.getState();
        const cid = state.currentPicmonicId;
        const picmonic = cid ? state.picmonics[cid] : null;
        if (cid && picmonic) {
          const next = replaceSymbolUuid(
            picmonic.notes,
            picker.chipUuid,
            newLayerId,
          );
          setNotes(cid, next);
          // Drop the old (now-orphaned) layer if it exists in canvas.
          const stillThere = picmonic.canvas.symbols.some(
            (s) => s.id === picker.chipUuid,
          );
          if (stillThere) {
            state.deleteSymbols([picker.chipUuid]);
          }
        }
        toast("Symbol replaced", {
          description: entry.displayName,
          duration: 1400,
        });
        closePicker();
        return;
      }

      if (picker.mode === "add-to-fact") {
        const newLayerId = addSymbol({
          ref: entry.id,
          x: CENTER_X,
          y: CENTER_Y,
        });
        if (!newLayerId) {
          closePicker();
          return;
        }
        const state = useStore.getState();
        const cid = state.currentPicmonicId;
        const picmonic = cid ? state.picmonics[cid] : null;
        if (cid && picmonic) {
          const parsed = parseNotes(picmonic.notes);
          const result = insertSymbolBullet(
            picmonic.notes,
            parsed,
            picker.factId,
            newLayerId,
          );
          setNotes(cid, result.newNotes);
        }
        toast("Symbol added", {
          description: entry.displayName,
          duration: 1400,
        });
        closePicker();
        return;
      }
    },
    [picker, currentPicmonicId, addSymbol, setNotes, pushRecentSymbol, closePicker],
  );

  if (!picker) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closePicker();
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{EYEBROW[picker.mode]}</DialogTitle>
        <DialogDescription>
          Search the symbol library to{" "}
          {picker.mode === "swap-broken"
            ? "replace the missing chip"
            : picker.mode === "replace"
              ? "replace the existing symbol"
              : "add a new symbol to this Fact"}
          .
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="eng-symbol-picker top-[18%] !translate-y-0 sm:max-w-xl p-0 gap-0"
        showCloseButton={false}
      >
        <div className="eng-symbol-picker__header">
          <span className="eng-symbol-picker__eyebrow">
            {EYEBROW[picker.mode]}
          </span>
          <button
            type="button"
            className="eng-symbol-picker__close"
            onClick={closePicker}
            aria-label="Close"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
        <div className="eng-symbol-picker__search">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols…"
            spellCheck={false}
            autoComplete="off"
            className="h-9 pl-8 text-sm"
          />
        </div>
        {recents.length > 0 ? (
          <div className="eng-symbol-picker__recents">
            <span className="eng-symbol-picker__group-label">Recent</span>
            <RecentStrip entries={recents} onActivate={handleActivate} />
          </div>
        ) : null}
        <div className="eng-symbol-picker__grid">
          {filtered.length === 0 ? (
            <div className="eng-symbol-picker__empty">
              {symbols.length === 0
                ? "Loading symbols…"
                : `No symbols match "${query.trim()}"`}
            </div>
          ) : (
            <LibraryGrid entries={filtered} onActivate={handleActivate} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
