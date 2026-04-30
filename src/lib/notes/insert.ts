import {
  UNASSIGNED_FACT_NAME,
  type ParsedFact,
  type ParsedNotes,
} from "./types";
import { parseNotes } from "./parse";

export interface InsertResult {
  newNotes: string;
  selection: number;
  factId: string;
}

function buildBullet(symbolUuid: string): string {
  return `* {sym:${symbolUuid}} `;
}

function trimTrailingWs(s: string, stopAt: number): number {
  let pos = s.length;
  while (pos > stopAt && /\s/.test(s[pos - 1])) pos--;
  return pos;
}

function insertAtFactEnd(
  notes: string,
  fact: ParsedFact,
  bullet: string,
): InsertResult {
  let pos = fact.bodyRange.to;
  while (pos > fact.headingTo && /\s/.test(notes[pos - 1])) pos--;
  const insertion = `\n${bullet}`;
  const newNotes = notes.slice(0, pos) + insertion + notes.slice(pos);
  return {
    newNotes,
    selection: pos + insertion.length,
    factId: fact.factId,
  };
}

function findUnassignedFact(parsed: ParsedNotes): ParsedFact | null {
  if (parsed.unassignedFactId) {
    return parsed.factsById.get(parsed.unassignedFactId) ?? null;
  }
  for (const fact of parsed.factsById.values()) {
    if (fact.name === UNASSIGNED_FACT_NAME) return fact;
  }
  return null;
}

function appendUnassigned(notes: string, bullet: string): InsertResult {
  const trimmedEnd = trimTrailingWs(notes, 0);
  const prefix = notes.slice(0, trimmedEnd);
  const separator = trimmedEnd === 0 ? "" : "\n\n";
  const heading = `## ${UNASSIGNED_FACT_NAME}\n`;
  const insertion = `${separator}${heading}${bullet}`;
  const newNotes = prefix + insertion;
  // re-parse to grab the synthesized factId for the freshly-added Unassigned
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

  const unassigned = findUnassignedFact(parsed);
  if (unassigned) return insertAtFactEnd(notes, unassigned, bullet);

  return appendUnassigned(notes, bullet);
}
