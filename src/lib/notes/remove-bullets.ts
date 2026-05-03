import type { ParsedNotes } from "./types";

/**
 * Strip every bullet line whose `{sym:UUID}` token references one of the given
 * symbol ids. Operates on raw notes text + a parsed snapshot. Lines are
 * removed wholesale (including their trailing newline). Idempotent.
 *
 * Used by `deleteSymbols` so canvas-side deletion atomically removes the
 * orphaned bullet from notes — both panes stay consistent and a single undo
 * restores the symbol AND the bullet together.
 */
export function removeOrphanedBullets(
  notes: string,
  parsed: ParsedNotes,
  symbolIds: ReadonlySet<string>,
): string {
  if (symbolIds.size === 0 || notes.length === 0) return notes;

  // Collect every bullet line number (1-indexed) that targets a deleted symbol.
  const linesToDrop = new Set<number>();
  for (const fact of parsed.factsById.values()) {
    for (const ref of fact.symbolRefs) {
      if (symbolIds.has(ref.symbolId.toLowerCase())) {
        linesToDrop.add(ref.bulletLine);
      }
    }
  }
  if (linesToDrop.size === 0) return notes;

  const lines = notes.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (linesToDrop.has(i + 1)) continue;
    kept.push(lines[i]);
  }
  return kept.join("\n");
}
