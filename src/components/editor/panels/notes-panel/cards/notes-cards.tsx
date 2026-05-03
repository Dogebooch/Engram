"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { getSymbolById } from "@/lib/symbols";
import { readSymbolDescription } from "@/lib/notes/insert";
import type { ParsedFact, ParsedNotes } from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { BulkActionBar } from "./bulk-action-bar";
import { FactCard } from "./fact-card";
import { SearchBar } from "./search-bar";
import { SectionHeader } from "./section-header";

interface NotesCardsProps {
  notes: string;
  parsed: ParsedNotes;
  symbols: readonly SymbolLayer[];
  picmonicId: string;
}

/**
 * Top-level cards surface for the right notes panel. Renders a flat list of
 * section dividers + fact cards in document order. Owns the symbol map +
 * derived ordinal numbering + search filter.
 */
export function NotesCards({ notes, parsed, symbols }: NotesCardsProps) {
  const lastActiveFactId = useStore((s) => s.lastActiveFactId);
  const selectedSymbolIds = useStore((s) => s.selectedSymbolIds);

  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);

  const symbolMap = React.useMemo(() => {
    const m = new Map<string, SymbolLayer>();
    for (const layer of symbols) m.set(layer.id, layer);
    return m;
  }, [symbols]);

  // Derived: which factIds match the query? When query is empty, all match.
  // A fact matches if its name, any of its symbol display names, or any
  // description on its bullets matches (case-insensitive substring).
  const visibleFactIds = React.useMemo<Set<string> | null>(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (q.length === 0) return null;
    const visible = new Set<string>();
    const factMatches = (fact: ParsedFact): boolean => {
      if (fact.name.toLowerCase().includes(q)) return true;
      for (const ref of fact.symbolRefs) {
        const layer = symbolMap.get(ref.symbolId);
        if (layer) {
          const entry = getSymbolById(layer.ref);
          if (entry?.displayName.toLowerCase().includes(q)) return true;
        }
        const desc = readSymbolDescription(notes, ref);
        if (desc.toLowerCase().includes(q)) return true;
      }
      return false;
    };
    for (const f of parsed.rootFacts) if (factMatches(f)) visible.add(f.factId);
    for (const sec of parsed.sections) {
      const sectionNameMatches = sec.name.toLowerCase().includes(q);
      for (const f of sec.facts) {
        if (sectionNameMatches || factMatches(f)) visible.add(f.factId);
      }
    }
    return visible;
  }, [deferredQuery, notes, parsed, symbolMap]);

  const totalCount = parsed.factsById.size;
  const matchCount = visibleFactIds === null ? totalCount : visibleFactIds.size;

  const isEmpty = totalCount === 0;

  if (isEmpty) {
    return (
      <div className="eng-notes-empty-state">
        <p className="eng-notes-empty-state__line">no facts yet</p>
        <p className="eng-notes-empty-state__hint">
          drop a symbol on the canvas, or press{" "}
          <kbd className="eng-notes-empty-state__kbd">F</kbd>
        </p>
      </div>
    );
  }

  // Continuous ordinal across sections — matches the spec sketch's "01", "02".
  let ordinal = 0;
  const cardFor = (fact: ParsedFact, n: number) => (
    <FactCard
      key={fact.factId}
      fact={fact}
      ordinal={n}
      notes={notes}
      symbolMap={symbolMap}
      isActive={lastActiveFactId === fact.factId}
      selectedSymbolIds={selectedSymbolIds}
    />
  );
  const isVisible = (factId: string) =>
    visibleFactIds === null ? true : visibleFactIds.has(factId);

  const noMatches = visibleFactIds !== null && visibleFactIds.size === 0;

  return (
    <>
      <SearchBar
        query={query}
        onChange={setQuery}
        matchCount={matchCount}
        totalCount={totalCount}
      />
      <div className="eng-notes-scroll">
        {noMatches && (
          <div className="eng-notes-empty-state">
            <p className="eng-notes-empty-state__line">no matches</p>
            <p className="eng-notes-empty-state__hint">
              for &ldquo;{deferredQuery}&rdquo;
            </p>
          </div>
        )}
        {parsed.rootFacts.length > 0 && (
          <div className="eng-notes-cards">
            {parsed.rootFacts.map((fact) => {
              ordinal += 1;
              return isVisible(fact.factId) ? cardFor(fact, ordinal) : null;
            })}
          </div>
        )}
        {parsed.sections.map((section) => {
          const visibleFacts = section.facts.filter((f) =>
            isVisible(f.factId),
          );
          if (visibleFacts.length === 0) {
            // Still bump ordinals for hidden facts so visible ones keep
            // their absolute position number.
            ordinal += section.facts.length;
            return null;
          }
          return (
            <section
              key={section.sectionId}
              data-section-id={section.sectionId}
              className="eng-notes-section"
            >
              <SectionHeader section={section} />
              <div className="eng-notes-cards">
                {section.facts.map((fact) => {
                  ordinal += 1;
                  return isVisible(fact.factId) ? cardFor(fact, ordinal) : null;
                })}
              </div>
            </section>
          );
        })}
      </div>
      <BulkActionBar />
    </>
  );
}
