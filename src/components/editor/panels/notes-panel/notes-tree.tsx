"use client";

import * as React from "react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  insertFact,
  insertSection,
  readSymbolDescription,
} from "@/lib/notes/insert";
import type {
  ParsedFact,
  ParsedNotes,
  ParsedSection,
  ParsedSymbolRef,
} from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { getSymbolById, useSymbolsReady } from "@/lib/symbols";
import { cn } from "@/lib/utils";

interface NotesTreeProps {
  notes: string;
  parsed: ParsedNotes;
  symbols: readonly SymbolLayer[];
  picmonicId: string;
}

/**
 * Structured outliner over the parsed notes. Section → Fact → Symbol(+desc).
 * Click rows to focus / select; quick-add buttons mutate the notes string
 * via `insertSection` / `insertFact` and round-trip through `setNotes`.
 *
 * The tree is a pure projection of `parseNotes()`; it owns no model. UI-
 * only state (which sections are collapsed) lives in component-local React
 * state — collapses don't survive reload, by design (cheap to expand again).
 */
export function NotesTree({ notes, parsed, symbols, picmonicId }: NotesTreeProps) {
  const setNotes = useStore((s) => s.setNotes);
  const setCursorContext = useStore((s) => s.setCursorContext);
  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
  const lastActiveFactId = useStore((s) => s.lastActiveFactId);
  const selectedSymbolIds = useStore((s) => s.selectedSymbolIds);

  // Section collapse state — local. Sections start expanded.
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(
    () => new Set(),
  );
  const toggleSection = React.useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const symbolMap = React.useMemo(() => {
    const m = new Map<string, SymbolLayer>();
    for (const layer of symbols) m.set(layer.id, layer);
    return m;
  }, [symbols]);

  const handleAddSection = React.useCallback(() => {
    const r = insertSection(notes, parsed);
    setNotes(picmonicId, r.newNotes);
  }, [notes, parsed, picmonicId, setNotes]);

  const handleAddFact = React.useCallback(
    (sectionId: string | null) => {
      const r = insertFact(notes, parsed, sectionId);
      setNotes(picmonicId, r.newNotes);
      // Make the freshly-created fact the active target so the next
      // library click / drag lands a bullet in it.
      setCursorContext({ factId: r.factId, symbolIds: [] });
    },
    [notes, parsed, picmonicId, setNotes, setCursorContext],
  );

  const handleFactClick = React.useCallback(
    (factId: string) => {
      setCursorContext({ factId, symbolIds: [] });
    },
    [setCursorContext],
  );

  const handleSymbolClick = React.useCallback(
    (symbolId: string) => {
      setSelectedSymbolIds([symbolId]);
    },
    [setSelectedSymbolIds],
  );

  const isEmpty =
    parsed.sections.length === 0 && parsed.rootFacts.length === 0;

  return (
    <div className="eng-notes-tree" data-eng-notes-tree>
      <div className="eng-notes-tree__scroll">
        {isEmpty ? (
          <EmptyState onAddSection={handleAddSection} onAddFact={() => handleAddFact(null)} />
        ) : (
          <>
            {parsed.rootFacts.length > 0 && (
              <ul className="eng-notes-tree__group" data-orphan>
                {parsed.rootFacts.map((fact) => (
                  <FactRow
                    key={fact.factId}
                    fact={fact}
                    notes={notes}
                    symbolMap={symbolMap}
                    isActive={lastActiveFactId === fact.factId}
                    selectedIds={selectedSymbolIds}
                    onFactClick={handleFactClick}
                    onSymbolClick={handleSymbolClick}
                  />
                ))}
              </ul>
            )}
            {parsed.sections.map((section) => (
              <SectionGroup
                key={section.sectionId}
                section={section}
                notes={notes}
                symbolMap={symbolMap}
                collapsed={collapsedSections.has(section.sectionId)}
                onToggle={toggleSection}
                onAddFact={handleAddFact}
                onFactClick={handleFactClick}
                onSymbolClick={handleSymbolClick}
                lastActiveFactId={lastActiveFactId}
                selectedIds={selectedSymbolIds}
              />
            ))}
          </>
        )}
      </div>
      <div className="eng-notes-tree__footer">
        <button
          type="button"
          className="eng-notes-tree__add eng-notes-tree__add--section"
          onClick={handleAddSection}
        >
          <PlusIcon className="eng-notes-tree__add-icon" />
          <span>Section</span>
        </button>
        {parsed.sections.length === 0 && (
          <button
            type="button"
            className="eng-notes-tree__add"
            onClick={() => handleAddFact(null)}
          >
            <PlusIcon className="eng-notes-tree__add-icon" />
            <span>Fact</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Section group — caret + name + add-fact button + nested fact list.
 * ------------------------------------------------------------------------- */

interface SectionGroupProps {
  section: ParsedSection;
  notes: string;
  symbolMap: Map<string, SymbolLayer>;
  collapsed: boolean;
  onToggle: (sectionId: string) => void;
  onAddFact: (sectionId: string) => void;
  onFactClick: (factId: string) => void;
  onSymbolClick: (symbolId: string) => void;
  lastActiveFactId: string | null;
  selectedIds: readonly string[];
}

function SectionGroup({
  section,
  notes,
  symbolMap,
  collapsed,
  onToggle,
  onAddFact,
  onFactClick,
  onSymbolClick,
  lastActiveFactId,
  selectedIds,
}: SectionGroupProps) {
  return (
    <section className="eng-notes-tree__section" data-collapsed={collapsed}>
      <header className="eng-notes-tree__section-header">
        <button
          type="button"
          className="eng-notes-tree__caret"
          onClick={() => onToggle(section.sectionId)}
          aria-label={collapsed ? "Expand section" : "Collapse section"}
          aria-expanded={!collapsed}
        >
          <ChevronRightIcon />
        </button>
        <button
          type="button"
          className="eng-notes-tree__section-name"
          onClick={() => onToggle(section.sectionId)}
          title={section.name}
        >
          {section.name}
        </button>
        <span className="eng-notes-tree__section-count" aria-hidden>
          {section.facts.length}
        </span>
        <button
          type="button"
          className="eng-notes-tree__inline-add"
          onClick={() => onAddFact(section.sectionId)}
          aria-label={`Add Fact to ${section.name}`}
          title="Add Fact"
        >
          <PlusIcon />
        </button>
      </header>
      {!collapsed && (
        <ul className="eng-notes-tree__group">
          {section.facts.map((fact) => (
            <FactRow
              key={fact.factId}
              fact={fact}
              notes={notes}
              symbolMap={symbolMap}
              isActive={lastActiveFactId === fact.factId}
              selectedIds={selectedIds}
              onFactClick={onFactClick}
              onSymbolClick={onSymbolClick}
            />
          ))}
          <li className="eng-notes-tree__group-add">
            <button
              type="button"
              className="eng-notes-tree__add eng-notes-tree__add--inline"
              onClick={() => onAddFact(section.sectionId)}
            >
              <PlusIcon className="eng-notes-tree__add-icon" />
              <span>Fact</span>
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Fact row — name + nested symbol list.
 * ------------------------------------------------------------------------- */

interface FactRowProps {
  fact: ParsedFact;
  notes: string;
  symbolMap: Map<string, SymbolLayer>;
  isActive: boolean;
  selectedIds: readonly string[];
  onFactClick: (factId: string) => void;
  onSymbolClick: (symbolId: string) => void;
}

function FactRow({
  fact,
  notes,
  symbolMap,
  isActive,
  selectedIds,
  onFactClick,
  onSymbolClick,
}: FactRowProps) {
  return (
    <li className="eng-notes-tree__fact" data-active={isActive}>
      <button
        type="button"
        className="eng-notes-tree__fact-name"
        onClick={() => onFactClick(fact.factId)}
        title={fact.name}
      >
        {fact.name}
      </button>
      {fact.symbolRefs.length > 0 && (
        <ul className="eng-notes-tree__symbols">
          {fact.symbolRefs.map((ref, i) => (
            <SymbolRow
              key={`${ref.symbolId}-${i}`}
              symbolRef={ref}
              notes={notes}
              layer={symbolMap.get(ref.symbolId)}
              selected={selectedIds.includes(ref.symbolId)}
              onClick={onSymbolClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------
 * Symbol row — thumb + display name + description text.
 * ------------------------------------------------------------------------- */

interface SymbolRowProps {
  symbolRef: ParsedSymbolRef;
  notes: string;
  layer: SymbolLayer | undefined;
  selected: boolean;
  onClick: (symbolId: string) => void;
}

function SymbolRow({ symbolRef, notes, layer, selected, onClick }: SymbolRowProps) {
  const symbolsReady = useSymbolsReady();
  const description = readSymbolDescription(notes, symbolRef);
  const broken = !layer;
  const entry = layer ? getSymbolById(layer.ref) : undefined;

  return (
    <li
      className={cn(
        "eng-notes-tree__symbol",
        broken && "eng-notes-tree__symbol--broken",
      )}
      data-selected={selected}
    >
      <button
        type="button"
        className="eng-notes-tree__symbol-trigger"
        onClick={() => !broken && onClick(symbolRef.symbolId)}
        disabled={broken}
        title={broken ? "Symbol no longer on canvas" : entry?.displayName ?? "Loading…"}
      >
        <span className="eng-notes-tree__symbol-thumb" aria-hidden>
          {broken ? (
            <span className="eng-notes-tree__symbol-thumb-broken">!</span>
          ) : entry?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.imageUrl} alt="" loading="lazy" />
          ) : symbolsReady ? (
            <span className="eng-notes-tree__symbol-thumb-broken">?</span>
          ) : (
            <span className="eng-notes-tree__symbol-thumb-placeholder" />
          )}
        </span>
        <span className="eng-notes-tree__symbol-text">
          <span className="eng-notes-tree__symbol-name">
            {broken ? "missing" : entry?.displayName ?? "…"}
          </span>
          {description && (
            <span className="eng-notes-tree__symbol-desc">{description}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/* -------------------------------------------------------------------------
 * Empty state — single big affordance for the first scene.
 * ------------------------------------------------------------------------- */

interface EmptyStateProps {
  onAddSection: () => void;
  onAddFact: () => void;
}

function EmptyState({ onAddSection, onAddFact }: EmptyStateProps) {
  return (
    <div className="eng-notes-tree__empty">
      <div className="eng-notes-tree__empty-eyebrow">Outline</div>
      <p className="eng-notes-tree__empty-prose">
        Drop a symbol on the canvas, or seed a structure here.
      </p>
      <div className="eng-notes-tree__empty-actions">
        <button
          type="button"
          className="eng-notes-tree__add eng-notes-tree__add--primary"
          onClick={onAddSection}
        >
          <PlusIcon className="eng-notes-tree__add-icon" />
          <span>Section</span>
        </button>
        <button
          type="button"
          className="eng-notes-tree__add eng-notes-tree__add--primary"
          onClick={onAddFact}
        >
          <PlusIcon className="eng-notes-tree__add-icon" />
          <span>Fact</span>
        </button>
      </div>
    </div>
  );
}
