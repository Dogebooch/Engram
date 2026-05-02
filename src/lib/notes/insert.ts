import {
  AUTO_FACT_ORDINAL_RE,
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
