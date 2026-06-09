"use client";

import * as React from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { removeFact } from "@/lib/notes/remove-fact";
import { setHeadingText } from "@/lib/notes/set-heading-text";
import type { ParsedFact, ParsedNotes } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { HeadingInput } from "./heading-input";
import { SymbolRow } from "./symbol-row";
import { beginOutlineDrag } from "./outline-drag";

interface FactCardProps {
  fact: ParsedFact;
  notes: string;
  parsed: ParsedNotes;
  currentId: string;
  focusHeadingFrom: number | null;
  onConsumeFocus: () => void;
}

/**
 * A Fact rendered as an editable box: title, an ✕ to delete the whole fact
 * (untag-only — its symbols stay on the canvas), its symbol rows, and a
 * "+ symbol" hand-off to the library.
 */
export function FactCard({
  fact,
  notes,
  parsed,
  currentId,
  focusHeadingFrom,
  onConsumeFocus,
}: FactCardProps) {
  const setNotes = useStore((s) => s.setNotes);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);
  const armed = useStore((s) => s.addSymbolTargetFactId === fact.factId);

  const commit = React.useCallback(
    (newNotes: string) => {
      setLastSyncSource("editor");
      setNotes(currentId, newNotes);
    },
    [currentId, setNotes, setLastSyncSource],
  );

  const shouldFocus = focusHeadingFrom === fact.headingFrom;
  React.useEffect(() => {
    if (shouldFocus) onConsumeFocus();
  }, [shouldFocus, onConsumeFocus]);

  const renameFact = (name: string) => {
    const result = setHeadingText(notes, fact.headingFrom, fact.headingTo, 2, name);
    if (result.ok) commit(result.newNotes);
  };

  const deleteFact = () => {
    const result = removeFact(notes, parsed, fact.factId);
    if (result.ok) commit(result.newNotes);
  };

  const addSymbol = () => {
    const st = useStore.getState();
    st.setAddSymbolTargetFact(fact.factId);
    st.setLibraryDrawerOpen(true);
    window.dispatchEvent(new CustomEvent("engram:focus-library-search"));
  };

  return (
    <div
      data-drag-fact
      data-fact-id={fact.factId}
      data-section-id={fact.sectionId ?? ""}
      className={cn(
        "eng-fact-card group/card relative rounded-[7px] border bg-foreground/[0.045]",
        armed
          ? "border-accent/55 shadow-[inset_3px_0_0_0_color-mix(in_oklch,var(--accent)_80%,transparent)]"
          : "border-border",
      )}
    >
      <div className="flex items-center gap-1.5 rounded-t-[7px] border-b border-border/55 bg-foreground/[0.06] px-2 py-1.5">
        <span
          role="button"
          aria-label="Drag to reorder fact"
          title="Drag to reorder or move to another section"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            beginOutlineDrag({ kind: "fact", factId: fact.factId, label: fact.name }, e.nativeEvent);
          }}
          className="eng-outline-grip flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/35 opacity-0 transition-opacity hover:text-muted-foreground/70 group-hover/card:opacity-100"
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="select-none font-mono text-[10px] font-semibold tracking-[0.1em] text-accent/55">
          ##
        </span>
        <HeadingInput
          value={fact.name}
          onCommit={renameFact}
          autoFocus={shouldFocus}
          placeholder="fact name"
          aria-label="Fact name"
          className="font-sans text-[12px] font-semibold leading-tight text-foreground/90"
        />
        <button
          type="button"
          onClick={deleteFact}
          aria-label="Delete this fact"
          title="Delete fact (its symbols stay on the canvas)"
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/45 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive/80 focus-visible:opacity-100 group-hover/card:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {fact.symbolRefs.length === 0 ? (
        <p className="px-2.5 py-2 font-mono text-[10px] italic text-muted-foreground/45">
          no symbols yet
        </p>
      ) : (
        <div>
          {fact.symbolRefs.map((ref, i) => (
            <SymbolRow
              key={`${ref.symbolId}:${ref.bulletLine}:${i}`}
              symbolId={ref.symbolId}
              factId={fact.factId}
              index={i}
              notes={notes}
              parsed={parsed}
              currentId={currentId}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addSymbol}
        className="flex w-full items-center gap-1.5 rounded-b-[7px] border-t border-border/45 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 transition-colors hover:bg-accent/[0.07] hover:text-foreground/80"
      >
        <Plus className="size-3 text-accent/70" />
        symbol
      </button>
    </div>
  );
}
