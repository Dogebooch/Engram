import {
  AUTO_FACT_ORDINAL_RE,
  UNASSIGNED_FACT_NAME,
  type ParsedFact,
  type ParsedNotes,
} from "./types";
import { parseNotes } from "./parse";
import { trimTrailingWs } from "./whitespace";

export interface InsertResult {
  newNotes: string;
  selection: number;
  factId: string;
}

function buildBullet(symbolUuid: string): string {
  return `* {sym:${symbolUuid}} `;
}

function insertAtFactEnd(
  notes: string,
  fact: ParsedFact,
  bullet: string,
): InsertResult {
  const pos = trimTrailingWs(notes.slice(0, fact.bodyRange.to), fact.headingTo);
  const insertion = `\n${bullet}`;
  const newNotes = notes.slice(0, pos) + insertion + notes.slice(pos);
  return {
    newNotes,
    selection: pos + insertion.length,
    factId: fact.factId,
  };
}

function findAutoFact(parsed: ParsedNotes): ParsedFact | null {
  if (parsed.unassignedFactId) {
    return parsed.factsById.get(parsed.unassignedFactId) ?? null;
  }
  for (const fact of parsed.factsById.values()) {
    if (fact.name === UNASSIGNED_FACT_NAME) return fact;
  }
  return null;
}

export function nextAutoFactName(parsed: ParsedNotes): string {
  let max = 0;
  for (const fact of parsed.factsById.values()) {
    const m = AUTO_FACT_ORDINAL_RE.exec(fact.name);
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `Fact ${max + 1}`;
}

function appendAutoFact(
  notes: string,
  bullet: string,
  parsed: ParsedNotes,
): InsertResult {
  const trimmedEnd = trimTrailingWs(notes, 0);
  const prefix = notes.slice(0, trimmedEnd);
  const separator = trimmedEnd === 0 ? "" : "\n\n";
  const heading = `## ${nextAutoFactName(parsed)}\n`;
  const insertion = `${separator}${heading}${bullet}`;
  const newNotes = prefix + insertion;
  // re-parse to grab the synthesized factId for the freshly-created auto-fact
  const reparsed = parseNotes(newNotes);
  const factId = reparsed.unassignedFactId ?? "";
  return {
    newNotes,
    selection: prefix.length + insertion.length,
    factId,
  };
}

export function insertSymbolBullet(
  notes: string,
  parsed: ParsedNotes,
  factId: string | null,
  symbolUuid: string,
): InsertResult {
  const bullet = buildBullet(symbolUuid);

  if (factId) {
    const fact = parsed.factsById.get(factId);
    if (fact) return insertAtFactEnd(notes, fact, bullet);
  }

  const autoFact = findAutoFact(parsed);
  if (autoFact) return insertAtFactEnd(notes, autoFact, bullet);

  return appendAutoFact(notes, bullet, parsed);
}

/**
 * Mutate `parsed` to reflect a bullet that was just inserted at `insertedAt`
 * with length `insertedLen`, targeting the fact `targetFactId`. Shifts all
 * offsets at or after `insertedAt` by `insertedLen`, extends the target
 * fact's bodyRange, registers the new symbolRef, and updates factsBySymbolId.
 *
 * Use only when the insertion went through `insertAtFactEnd` (the simple
 * fast path). For `appendAutoFact` paths, callers must re-parse — those
 * insertions create new headings and synthesize new factIds.
 */
export function applyBulletInsertion(
  notes: string,
  parsed: ParsedNotes,
  targetFactId: string,
  symbolUuid: string,
  insertedAt: number,
  insertedLen: number,
): void {
  const target = parsed.factsById.get(targetFactId);
  if (!target) return;
  for (const section of parsed.sections) {
    if (section.headingFrom >= insertedAt) {
      section.headingFrom += insertedLen;
      section.headingTo += insertedLen;
    }
  }
  for (const fact of parsed.factsById.values()) {
    if (fact.headingFrom >= insertedAt) {
      fact.headingFrom += insertedLen;
      fact.headingTo += insertedLen;
    }
    if (fact.bodyRange.from >= insertedAt) {
      fact.bodyRange.from += insertedLen;
    }
    if (fact.bodyRange.to >= insertedAt) {
      fact.bodyRange.to += insertedLen;
    }
    for (const ref of fact.symbolRefs) {
      if (ref.start >= insertedAt) {
        ref.start += insertedLen;
        ref.end += insertedLen;
        ref.bulletLine += 1;
      }
    }
  }
  // Insertion is "\n* {sym:UUID} ", so the token starts after "\n* ".
  const tokenStart = insertedAt + "\n* ".length;
  const tokenEnd = tokenStart + `{sym:${symbolUuid}}`.length;
  // bulletLine is 1-indexed in parseNotes; count newlines up to tokenStart.
  let bulletLine = 1;
  for (let i = 0; i < tokenStart; i++) if (notes.charCodeAt(i) === 10) bulletLine++;
  target.symbolRefs.push({
    symbolId: symbolUuid,
    start: tokenStart,
    end: tokenEnd,
    bulletLine,
  });
  parsed.docLength += insertedLen;
  const arr = parsed.factsBySymbolId.get(symbolUuid) ?? [];
  if (!arr.includes(targetFactId)) {
    arr.push(targetFactId);
    parsed.factsBySymbolId.set(symbolUuid, arr);
  }
}
