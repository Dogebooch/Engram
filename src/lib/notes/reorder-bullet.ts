import type { ParsedNotes } from "./types";

export interface MoveBulletToIndexResult {
  newNotes: string;
  ok: boolean;
}

/**
 * Move a symbol's bullet line to position `toIndex` among the target Fact's
 * bullets, where `toIndex` is "insert before the bullet currently at that index"
 * (drop-indicator semantics; `toIndex >= count` appends). Handles within-fact
 * reorder (fromFactId === toFactId) and cross-fact moves uniformly by splicing
 * whole lines, so the full `description → meaning; why` travels with the bullet.
 *
 * Assumes one symbol per single-line bullet (the Form view norm). Pure.
 */
export function moveBulletToIndex(
  notes: string,
  parsed: ParsedNotes,
  symbolId: string,
  fromFactId: string,
  toFactId: string,
  toIndex: number,
): MoveBulletToIndexResult {
  const fromFact = parsed.factsById.get(fromFactId);
  const toFact = parsed.factsById.get(toFactId);
  if (!fromFact || !toFact) return { newNotes: notes, ok: false };

  const norm = symbolId.toLowerCase();
  const srcRef = fromFact.symbolRefs.find((r) => r.symbolId.toLowerCase() === norm);
  if (!srcRef) return { newNotes: notes, ok: false };

  const lines = notes.split("\n");
  const srcIdx = srcRef.bulletLine - 1;
  if (srcIdx < 0 || srcIdx >= lines.length) return { newNotes: notes, ok: false };
  const lineText = lines[srcIdx];

  const tRefs = toFact.symbolRefs;
  // Target line index in ORIGINAL coordinates.
  let targetIdx: number;
  if (tRefs.length === 0) {
    targetIdx = toFact.headingLine; // the line just after the heading
  } else if (toIndex >= tRefs.length) {
    targetIdx = tRefs[tRefs.length - 1].bulletLine; // after the last bullet
  } else {
    targetIdx = tRefs[Math.max(0, toIndex)].bulletLine - 1; // before bullet at toIndex
  }

  lines.splice(srcIdx, 1);
  const insertIdx = srcIdx < targetIdx ? targetIdx - 1 : targetIdx;
  lines.splice(insertIdx, 0, lineText);

  return { newNotes: lines.join("\n"), ok: true };
}
