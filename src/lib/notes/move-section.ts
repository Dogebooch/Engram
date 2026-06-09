import { parseNotes } from "./parse";
import type { ParsedNotes } from "./types";

export type MoveSectionAnchor =
  | { type: "before-section"; sectionId: string }
  | { type: "end" };

export interface MoveSectionResult {
  newNotes: string;
  ok: boolean;
}

function spliceBlockIn(text: string, offset: number, block: string): string {
  const needLead = offset > 0 && text[offset - 1] !== "\n";
  const insertion = `${needLead ? "\n" : ""}${block}\n`;
  return text.slice(0, offset) + insertion + text.slice(offset);
}

/**
 * Relocate a whole `# Section` block (heading + all its facts) among the other
 * sections — before a given section, or to the end. Root facts (which precede
 * the first section) are never disturbed. Pure; re-parses once after removal.
 */
export function moveSection(
  notes: string,
  parsed: ParsedNotes,
  sectionId: string,
  anchor: MoveSectionAnchor,
): MoveSectionResult {
  const idx = parsed.sections.findIndex((s) => s.sectionId === sectionId);
  if (idx === -1) return { newNotes: notes, ok: false };
  if (anchor.type === "before-section" && anchor.sectionId === sectionId) {
    return { newNotes: notes, ok: true };
  }

  const sec = parsed.sections[idx];
  const next = parsed.sections[idx + 1];
  const end = next ? next.headingFrom : notes.length;

  const block = notes.slice(sec.headingFrom, end).replace(/\s+$/, "");
  if (!block) return { newNotes: notes, ok: false };

  const removed = notes.slice(0, sec.headingFrom) + notes.slice(end);
  const p1 = parseNotes(removed);

  let offset = removed.length;
  if (anchor.type === "before-section") {
    const t = p1.sections.find((s) => s.sectionId === anchor.sectionId);
    offset = t ? t.headingFrom : removed.length;
  }
  return { newNotes: spliceBlockIn(removed, offset, block), ok: true };
}
