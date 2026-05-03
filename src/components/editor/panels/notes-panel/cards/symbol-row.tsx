"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { readSymbolDescription, setSymbolDescription } from "@/lib/notes/insert";
import { getSymbolById, useSymbolsReady } from "@/lib/symbols";
import type { ParsedSymbolRef } from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { cn } from "@/lib/utils";
import { InlineText } from "./inline-text";

interface SymbolRowProps {
  symbolRef: ParsedSymbolRef;
  notes: string;
  layer: SymbolLayer | undefined;
  selected: boolean;
}

/**
 * One symbol bullet inside a fact card: thumbnail · display name · arrow ·
 * description. Phase 2 is read-only with selection wiring; Phase 3 makes the
 * description inline-editable; Phase 6 adds Cmd-click multi-select.
 */
export function SymbolRow({
  symbolRef,
  notes,
  layer,
  selected,
}: SymbolRowProps) {
  const symbolsReady = useSymbolsReady();
  const description = readSymbolDescription(notes, symbolRef);
  const broken = !layer;
  const entry = layer ? getSymbolById(layer.ref) : undefined;

  const onClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (broken) return;
      const s = useStore.getState();
      s.setLastSyncSource("editor");
      // Cmd/Ctrl-click toggles into multi-select; plain click replaces.
      if (e.metaKey || e.ctrlKey) {
        s.toggleGroupAware(symbolRef.symbolId);
      } else {
        s.setSelectedSymbolIds([symbolRef.symbolId]);
      }
    },
    [broken, symbolRef.symbolId],
  );

  const onCommitDesc = React.useCallback(
    (next: string) => {
      const s = useStore.getState();
      const cid = s.currentPicmonicId;
      if (!cid) return;
      const picmonic = s.picmonics[cid];
      if (!picmonic) return;
      // Re-resolve ref against fresh notes — offsets may have shifted.
      const parsed = parseNotes(picmonic.notes);
      let fresh: ParsedSymbolRef | null = null;
      for (const fact of parsed.factsById.values()) {
        for (const r of fact.symbolRefs) {
          if (r.symbolId === symbolRef.symbolId && r.start === symbolRef.start) {
            fresh = r;
            break;
          }
        }
        if (fresh) break;
      }
      if (!fresh) {
        // fall back: any ref with this uuid
        for (const fact of parsed.factsById.values()) {
          for (const r of fact.symbolRefs) {
            if (r.symbolId === symbolRef.symbolId) {
              fresh = r;
              break;
            }
          }
          if (fresh) break;
        }
      }
      if (!fresh) return;
      const nextNotes = setSymbolDescription(picmonic.notes, fresh, next);
      if (nextNotes !== picmonic.notes) s.setNotes(cid, nextNotes);
    },
    [symbolRef.symbolId, symbolRef.start],
  );

  return (
    <div
      className={cn(
        "eng-notes-symrow",
        broken && "eng-notes-symrow--broken",
      )}
      data-selected={selected || undefined}
    >
      <button
        type="button"
        className="eng-notes-symrow__thumb"
        onClick={onClick}
        disabled={broken}
        aria-label={
          broken
            ? "Missing symbol"
            : `Reveal ${entry?.displayName ?? "symbol"} on canvas`
        }
        title={
          broken
            ? "Symbol no longer on canvas"
            : entry?.displayName ?? "Loading…"
        }
      >
        {broken ? (
          <span className="eng-notes-symrow__thumb-broken" aria-hidden>
            !
          </span>
        ) : entry?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.imageUrl} alt="" loading="lazy" />
        ) : symbolsReady ? (
          <span className="eng-notes-symrow__thumb-broken" aria-hidden>
            ?
          </span>
        ) : (
          <span className="eng-notes-symrow__thumb-placeholder" aria-hidden />
        )}
      </button>
      <span className="eng-notes-symrow__name">
        {broken ? "missing" : entry?.displayName ?? "…"}
      </span>
      <span className="eng-notes-symrow__arrow" aria-hidden>
        →
      </span>
      <InlineText
        value={description}
        placeholder="describe…"
        ariaLabel="Symbol description"
        className="eng-notes-symrow__desc"
        inputClassName="eng-notes-symrow__desc-input"
        onCommit={onCommitDesc}
      />
    </div>
  );
}
