"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, usePicmonic } from "@/lib/store/hooks";
import { parseNotes } from "@/lib/notes/parse";
import { insertHeadingText } from "@/lib/notes/insert-heading";
import { loadSymbols } from "@/lib/symbols";
import { FactCard } from "./fact-card";
import { SectionGroup } from "./section-group";
import { OutlineEmpty } from "./outline-empty";

/**
 * The structured Fact-card surface — the primary notes editor. A pure
 * projection of `parseNotes(picmonic.notes)`; every add/edit/delete writes
 * back through the `src/lib/notes/` helpers, so markdown stays canonical.
 */
export function OutlineView() {
  const picmonic = usePicmonic();
  const currentId = useCurrentPicmonicId();
  const setNotes = useStore((s) => s.setNotes);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);

  const notes = picmonic?.notes ?? "";
  const parsed = React.useMemo(() => parseNotes(notes), [notes]);

  // The heading whose title input should grab focus once it renders (set right
  // after an add, cleared the first time a card consumes it).
  const [focusHeadingFrom, setFocusHeadingFrom] = React.useState<number | null>(null);
  const consumeFocus = React.useCallback(() => setFocusHeadingFrom(null), []);

  // Re-render once the symbol-library cache populates so rows can resolve names.
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    let cancelled = false;
    loadSymbols()
      .then(() => {
        if (!cancelled) force();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = React.useCallback(
    (newNotes: string) => {
      if (!currentId) return;
      setLastSyncSource("editor");
      setNotes(currentId, newNotes);
    },
    [currentId, setNotes, setLastSyncSource],
  );

  const addFactAtEnd = React.useCallback(() => {
    const result = insertHeadingText(notes, notes.length, 2, "New fact");
    commit(result.newNotes);
    setFocusHeadingFrom(result.headingFrom);
  }, [notes, commit]);

  const addSectionAtEnd = React.useCallback(() => {
    const result = insertHeadingText(notes, notes.length, 1, "New section");
    commit(result.newNotes);
    setFocusHeadingFrom(result.headingFrom);
  }, [notes, commit]);

  if (!picmonic || !currentId) return null;

  const isEmpty =
    parsed.rootFacts.length === 0 && parsed.sections.length === 0;

  return (
    <div className="eng-outline flex h-full flex-col overflow-y-auto px-3 py-3">
      {isEmpty ? (
        <OutlineEmpty onAddSection={addSectionAtEnd} onAddFact={addFactAtEnd} />
      ) : (
        <>
          {parsed.rootFacts.length > 0 && (
            <div className="mb-1 flex flex-col gap-2.5">
              {parsed.rootFacts.map((fact) => (
                <FactCard
                  key={fact.factId}
                  fact={fact}
                  notes={notes}
                  parsed={parsed}
                  currentId={currentId}
                  focusHeadingFrom={focusHeadingFrom}
                  onConsumeFocus={consumeFocus}
                />
              ))}
            </div>
          )}

          {parsed.sections.map((section) => (
            <SectionGroup
              key={section.sectionId}
              section={section}
              notes={notes}
              parsed={parsed}
              currentId={currentId}
              focusHeadingFrom={focusHeadingFrom}
              onConsumeFocus={consumeFocus}
              onFocusHeading={setFocusHeadingFrom}
            />
          ))}

          <div className="mt-5 flex items-center gap-2 border-t border-border/50 pt-3">
            <button
              type="button"
              onClick={addFactAtEnd}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground/75 transition-colors hover:border-accent/45 hover:bg-accent/[0.06]"
            >
              <Plus className="size-3 text-accent/70" />
              fact
            </button>
            <button
              type="button"
              onClick={addSectionAtEnd}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground/75 transition-colors hover:border-accent/45 hover:bg-accent/[0.06]"
            >
              <Plus className="size-3 text-accent/70" />
              section
            </button>
          </div>
        </>
      )}
    </div>
  );
}
