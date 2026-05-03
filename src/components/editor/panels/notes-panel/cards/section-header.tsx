"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { setSectionName } from "@/lib/notes/insert";
import type { ParsedSection } from "@/lib/notes/types";
import { InlineText } from "./inline-text";

interface SectionHeaderProps {
  section: ParsedSection;
}

/**
 * Eyebrow divider between groups of fact cards. No caret, no collapse.
 * Section name is inline-editable via <InlineText>.
 */
export function SectionHeader({ section }: SectionHeaderProps) {
  const onCommit = React.useCallback(
    (next: string) => {
      const s = useStore.getState();
      const cid = s.currentPicmonicId;
      if (!cid) return;
      const picmonic = s.picmonics[cid];
      if (!picmonic) return;
      // Re-parse against current notes so headingFrom/headingTo are valid.
      const parsed = parseNotes(picmonic.notes);
      const fresh = parsed.sections.find((sec) => sec.sectionId === section.sectionId);
      if (!fresh) return;
      const nextNotes = setSectionName(picmonic.notes, parsed, fresh.sectionId, next);
      if (nextNotes !== picmonic.notes) s.setNotes(cid, nextNotes);
    },
    [section.sectionId],
  );

  return (
    <div
      className="eng-notes-section-header"
      data-section-id={section.sectionId}
      role="separator"
      aria-label={`Section: ${section.name}`}
    >
      <span className="eng-notes-section-header__rule" aria-hidden />
      <InlineText
        value={section.name}
        ariaLabel="Section name"
        className="eng-notes-section-header__name"
        inputClassName="eng-notes-section-header__input"
        onCommit={onCommit}
      />
      <span className="eng-notes-section-header__rule" aria-hidden />
    </div>
  );
}
