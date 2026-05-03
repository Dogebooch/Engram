"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { setFactName } from "@/lib/notes/insert";
import type { ParsedFact } from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { InlineText } from "./inline-text";
import { SymbolRow } from "./symbol-row";

interface FactCardProps {
  fact: ParsedFact;
  ordinal: number;
  notes: string;
  symbolMap: Map<string, SymbolLayer>;
  isActive: boolean;
  selectedSymbolIds: readonly string[];
}

/**
 * One numbered fact card: ordinal + name header, then a list of symbol rows.
 * Phase 2 is read-only display + hover→canvas sync. Phase 3 makes the name
 * inline-editable. Phase 4 adds keyboard focus + S/#/Cmd+↑↓.
 */
export function FactCard({
  fact,
  ordinal,
  notes,
  symbolMap,
  isActive,
  selectedSymbolIds,
}: FactCardProps) {
  const setHoveredFact = useStore((s) => s.setHoveredFact);
  const setCursorContext = useStore((s) => s.setCursorContext);

  const onMouseEnter = React.useCallback(() => {
    setHoveredFact(fact.factId);
  }, [fact.factId, setHoveredFact]);

  const onMouseLeave = React.useCallback(() => {
    setHoveredFact(null);
  }, [setHoveredFact]);

  const onClick = React.useCallback(() => {
    setCursorContext({ factId: fact.factId, symbolIds: [] });
  }, [fact.factId, setCursorContext]);

  const onFocus = React.useCallback(() => {
    setCursorContext({ factId: fact.factId, symbolIds: [] });
  }, [fact.factId, setCursorContext]);

  const onContextMenu = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent("engram:open-fact-card-menu", {
          detail: { factId: fact.factId, x: e.clientX, y: e.clientY },
        }),
      );
    },
    [fact.factId],
  );

  const onCommitName = React.useCallback(
    (next: string) => {
      const s = useStore.getState();
      const cid = s.currentPicmonicId;
      if (!cid) return;
      const picmonic = s.picmonics[cid];
      if (!picmonic) return;
      const parsed = parseNotes(picmonic.notes);
      const fresh = parsed.factsById.get(fact.factId);
      if (!fresh) return;
      const nextNotes = setFactName(picmonic.notes, parsed, fresh.factId, next);
      if (nextNotes !== picmonic.notes) s.setNotes(cid, nextNotes);
    },
    [fact.factId],
  );

  return (
    <article
      className="eng-notes-card"
      data-fact-id={fact.factId}
      data-active={isActive || undefined}
      tabIndex={0}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onFocus={onFocus}
      onContextMenu={onContextMenu}
    >
      <header className="eng-notes-card__head">
        <span className="eng-notes-card__num" aria-hidden>
          {String(ordinal).padStart(2, "0")}
        </span>
        <span className="eng-notes-card__sep" aria-hidden>
          ·
        </span>
        <InlineText
          value={fact.name}
          ariaLabel="Fact name"
          className="eng-notes-card__name"
          inputClassName="eng-notes-card__name-input"
          onCommit={onCommitName}
        />
      </header>
      {fact.symbolRefs.length > 0 && (
        <div className="eng-notes-card__symbols">
          {fact.symbolRefs.map((ref, i) => (
            <SymbolRow
              key={`${ref.symbolId}-${i}`}
              symbolRef={ref}
              notes={notes}
              layer={symbolMap.get(ref.symbolId)}
              selected={selectedSymbolIds.includes(ref.symbolId)}
            />
          ))}
        </div>
      )}
    </article>
  );
}
