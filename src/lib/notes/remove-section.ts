import type { ParsedNotes } from "./types";

export interface RemoveSectionResult {
  newNotes: string;
  ok: boolean;
}

/**
 * Remove a `# Section` heading and everything under it up to the next section
 * (or EOF) — including all the facts it contains. Root facts (which precede the
 * first section) are never touched. Untag-only: the contained symbols' canvas
 * layers remain. Pure: does not mutate `parsed`.
 */
export function removeSection(
  notes: string,
  parsed: ParsedNotes,
  sectionId: string,
): RemoveSectionResult {
  const idx = parsed.sections.findIndex((s) => s.sectionId === sectionId);
  if (idx === -1) return { newNotes: notes, ok: false };

  const section = parsed.sections[idx];
  const next = parsed.sections[idx + 1];
  const endOffset = next ? next.headingFrom : notes.length;

  const before = notes.slice(0, section.headingFrom);
  const after = notes.slice(endOffset);
  let result = before + after;
  if (after.length === 0) result = result.replace(/\n\s*$/, "\n");
  return { newNotes: result, ok: true };
}
