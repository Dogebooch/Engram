import { parseNotes } from "./parse";
import { trimTrailingWs } from "./whitespace";
import type { ParsedFact, ParsedNotes, ParsedSymbolRef } from "./types";

export interface MoveSymbolBulletResult {
  newNotes: string;
  ok: boolean;
  moved: boolean;
}

const SYM_TOKEN_RE =
  /\{sym:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}/gi;

function lineRangeForOffsets(
  notes: string,
  tokenStart: number,
  tokenEnd: number,
): { from: number; to: number; text: string } | null {
  let from = tokenStart;
  while (from > 0 && notes.charCodeAt(from - 1) !== 10) from--;

  let lineEnd = notes.indexOf("\n", tokenEnd);
  if (lineEnd === -1) lineEnd = notes.length;

  const text = notes.slice(from, lineEnd);
  if (text.trim().length === 0) return null;

  const to = lineEnd < notes.length ? lineEnd + 1 : lineEnd;
  return { from, to, text };
}

function lineRangeForRef(
  notes: string,
  ref: ParsedSymbolRef,
): { from: number; to: number; text: string } | null {
  return lineRangeForOffsets(notes, ref.start, ref.end);
}

function lineRangeForSymbolInFact(
  notes: string,
  fact: ParsedFact,
  symbolId: string,
): { from: number; to: number; text: string } | null {
  const body = notes.slice(fact.bodyRange.from, fact.bodyRange.to);
  SYM_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SYM_TOKEN_RE.exec(body))) {
    if (match[1].toLowerCase() !== symbolId) continue;
    const tokenStart = fact.bodyRange.from + match.index;
    return lineRangeForOffsets(
      notes,
      tokenStart,
      tokenStart + match[0].length,
    );
  }
  return null;
}

function factBodyHasSymbol(
  notes: string,
  fact: ParsedFact,
  symbolId: string,
): boolean {
  if (fact.symbolRefs.some((r) => r.symbolId.toLowerCase() === symbolId)) {
    return true;
  }
  const body = notes.slice(fact.bodyRange.from, fact.bodyRange.to);
  SYM_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SYM_TOKEN_RE.exec(body))) {
    if (match[1].toLowerCase() === symbolId) return true;
  }
  return false;
}

/**
 * Move one symbol bullet line from one Fact to another, preserving the full
 * markdown line so description / meaning / why text moves together.
 */
export function moveSymbolBulletToFact(
  notes: string,
  parsed: ParsedNotes,
  symbolId: string,
  fromFactId: string,
  toFactId: string,
): MoveSymbolBulletResult {
  if (!symbolId || !fromFactId || !toFactId) {
    return { newNotes: notes, ok: false, moved: false };
  }
  if (fromFactId === toFactId) {
    return { newNotes: notes, ok: true, moved: false };
  }

  const fromFact = parsed.factsById.get(fromFactId);
  const toFact = parsed.factsById.get(toFactId);
  if (!fromFact || !toFact) {
    return { newNotes: notes, ok: false, moved: false };
  }

  const normalizedSymbolId = symbolId.toLowerCase();
  const ref = fromFact.symbolRefs.find(
    (r) => r.symbolId.toLowerCase() === normalizedSymbolId,
  );
  const range = ref
    ? lineRangeForRef(notes, ref)
    : lineRangeForSymbolInFact(notes, fromFact, normalizedSymbolId);
  if (!range) return { newNotes: notes, ok: false, moved: false };

  const withoutSource = notes.slice(0, range.from) + notes.slice(range.to);
  const targetAlreadyHasSymbol = factBodyHasSymbol(
    notes,
    toFact,
    normalizedSymbolId,
  );
  if (targetAlreadyHasSymbol) {
    return { newNotes: withoutSource, ok: true, moved: true };
  }

  const reparsed = parseNotes(withoutSource);
  const target = reparsed.factsById.get(toFactId);
  if (!target) return { newNotes: notes, ok: false, moved: false };

  const pos = trimTrailingWs(
    withoutSource.slice(0, target.bodyRange.to),
    target.headingTo,
  );
  const insertion = `\n${range.text}`;
  return {
    newNotes: withoutSource.slice(0, pos) + insertion + withoutSource.slice(pos),
    ok: true,
    moved: true,
  };
}
