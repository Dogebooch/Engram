import type { ParsedNotes } from "./types";

export interface RemoveFactResult {
  newNotes: string;
  ok: boolean;
}

/**
 * Remove a whole `## Fact` block — its heading and every bullet under it —
 * from the notes. `headingFrom` is a line start and `bodyRange.to` is the next
 * heading's start (or EOF), so the raw splice already preserves inter-fact
 * spacing; we only tidy a trailing blank line when the deleted fact ran to the
 * end of the document.
 *
 * Untag-only by design: the symbols' canvas layers are untouched (they become
 * untagged, which the linter surfaces). Any enclosing `# Section` heading is
 * left intact. Pure: does not mutate `parsed`.
 */
export function removeFact(
  notes: string,
  parsed: ParsedNotes,
  factId: string,
): RemoveFactResult {
  const fact = parsed.factsById.get(factId);
  if (!fact) return { newNotes: notes, ok: false };

  const before = notes.slice(0, fact.headingFrom);
  const after = notes.slice(fact.bodyRange.to);
  let result = before + after;
  if (after.length === 0) result = result.replace(/\n\s*$/, "\n");
  return { newNotes: result, ok: true };
}
