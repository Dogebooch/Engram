"use client";

import * as React from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { insertHeadingText } from "@/lib/notes/insert-heading";
import { removeSection } from "@/lib/notes/remove-section";
import { setHeadingText } from "@/lib/notes/set-heading-text";
import type { ParsedNotes, ParsedSection } from "@/lib/notes/types";
import { HeadingInput } from "./heading-input";
import { FactCard } from "./fact-card";
import { beginOutlineDrag } from "./outline-drag";

interface SectionGroupProps {
  section: ParsedSection;
  notes: string;
  parsed: ParsedNotes;
  currentId: string;
  focusHeadingFrom: number | null;
  onConsumeFocus: () => void;
  onFocusHeading: (headingFrom: number) => void;
}

/**
 * A `#` Section: an editable divider with an ✕ to delete the whole group, the
 * Fact cards beneath it, and a "+ fact" that appends a new card to this section.
 */
export function SectionGroup({
  section,
  notes,
  parsed,
  currentId,
  focusHeadingFrom,
  onConsumeFocus,
  onFocusHeading,
}: SectionGroupProps) {
  const setNotes = useStore((s) => s.setNotes);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);

  const commit = React.useCallback(
    (newNotes: string) => {
      setLastSyncSource("editor");
      setNotes(currentId, newNotes);
    },
    [currentId, setNotes, setLastSyncSource],
  );

  const shouldFocus = focusHeadingFrom === section.headingFrom;
  React.useEffect(() => {
    if (shouldFocus) onConsumeFocus();
  }, [shouldFocus, onConsumeFocus]);

  const renameSection = (name: string) => {
    const result = setHeadingText(notes, section.headingFrom, section.headingTo, 1, name);
    if (result.ok) commit(result.newNotes);
  };

  const deleteSection = () => {
    const result = removeSection(notes, parsed, section.sectionId);
    if (result.ok) commit(result.newNotes);
  };

  const addFact = () => {
    const atOffset = section.facts.length
      ? section.facts[section.facts.length - 1].bodyRange.to
      : section.headingTo;
    const result = insertHeadingText(notes, atOffset, 2, "New fact");
    commit(result.newNotes);
    onFocusHeading(result.headingFrom);
  };

  return (
    <section className="eng-outline-section" data-drag-section data-section-id={section.sectionId}>
      <div
        data-section-head
        className="group/section mb-2 mt-5 flex items-center gap-1.5 border-b border-border/70 pb-1.5 first:mt-1"
      >
        <span
          role="button"
          aria-label="Drag to reorder section"
          title="Drag to reorder section"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            beginOutlineDrag({ kind: "section", sectionId: section.sectionId, label: section.name }, e.nativeEvent);
          }}
          className="eng-outline-grip flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/35 opacity-0 transition-opacity hover:text-muted-foreground/70 group-hover/section:opacity-100"
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="select-none font-mono text-[10px] font-semibold tracking-[0.12em] text-accent/70">
          #
        </span>
        <HeadingInput
          value={section.name}
          onCommit={renameSection}
          autoFocus={shouldFocus}
          placeholder="section name"
          aria-label="Section name"
          className="font-sans text-[15px] font-semibold leading-tight text-foreground"
        />
        <button
          type="button"
          onClick={deleteSection}
          aria-label="Delete this section"
          title="Delete section and its facts (symbols stay on canvas)"
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/45 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive/80 focus-visible:opacity-100 group-hover/section:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {section.facts.map((fact) => (
          <FactCard
            key={fact.factId}
            fact={fact}
            notes={notes}
            parsed={parsed}
            currentId={currentId}
            focusHeadingFrom={focusHeadingFrom}
            onConsumeFocus={onConsumeFocus}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addFact}
        className="mt-2 flex items-center gap-1.5 rounded-md border border-dashed border-border/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60 transition-colors hover:border-accent/45 hover:bg-accent/[0.06] hover:text-foreground/80"
      >
        <Plus className="size-3 text-accent/70" />
        fact
      </button>
    </section>
  );
}
