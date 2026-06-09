import type { ParsedNotes } from "./types";

export interface RemoveBulletFromFactResult {
  newNotes: string;
  ok: boolean;
}

/**
 * Strip a single symbol's bullet line from one specific Fact — the per-fact
 * untag. Unlike `removeOrphanedBullets` (which is symbol-wide), this touches
 * only the matching bullet inside `factId`, so a symbol tagged in several Facts
 * keeps its other bullets and its canvas layer. Pure: does not mutate `parsed`.
 */
export function removeBulletFromFact(
  notes: string,
  parsed: ParsedNotes,
  factId: string,
  symbolId: string,
): RemoveBulletFromFactResult {
  const fact = parsed.factsById.get(factId);
  if (!fact) return { newNotes: notes, ok: false };

  const norm = symbolId.toLowerCase();
  const ref = fact.symbolRefs.find((r) => r.symbolId.toLowerCase() === norm);
  if (!ref) return { newNotes: notes, ok: false };

  // Expand the token offsets to the full bullet line, including its newline.
  let from = ref.start;
  while (from > 0 && notes.charCodeAt(from - 1) !== 10) from--;
  let lineEnd = notes.indexOf("\n", ref.end);
  if (lineEnd === -1) lineEnd = notes.length;
  const to = lineEnd < notes.length ? lineEnd + 1 : lineEnd;

  return { newNotes: notes.slice(0, from) + notes.slice(to), ok: true };
}
