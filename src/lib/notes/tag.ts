import {
  UNASSIGNED_FACT_NAME,
  type ParsedNotes,
} from "./types";
import { applyBulletInsertion, insertSymbolBullet } from "./insert";
import { parseNotes } from "./parse";
import { trimTrailingWs } from "./whitespace";

export interface TagResult {
  newNotes: string;
  factId: string;
  alreadyTagged: boolean;
  /** True when a brand-new `## name` heading was synthesized for this tag. */
  createdFact: boolean;
}

function isAlreadyTagged(
  parsed: ParsedNotes,
  symbolId: string,
  factId: string,
): boolean {
  return parsed.factsBySymbolId.get(symbolId)?.includes(factId) ?? false;
}

/**
 * Tag a symbol with an existing Fact by synthesized factId.
 * Idempotent: returns alreadyTagged=true if the symbol is already in that fact.
 * If factId is not found, returns the original notes unchanged with a sentinel
 * factId — caller should fall back to `tagSymbolWithNewFact`.
 */
export function tagSymbolWithFact(
  notes: string,
  parsed: ParsedNotes,
  symbolId: string,
  factId: string,
): TagResult {
  if (!parsed.factsById.has(factId)) {
    return { newNotes: notes, factId, alreadyTagged: false, createdFact: false };
  }
  if (isAlreadyTagged(parsed, symbolId, factId)) {
    return { newNotes: notes, factId, alreadyTagged: true, createdFact: false };
  }
  const inserted = insertSymbolBullet(notes, parsed, factId, symbolId);
  return {
    newNotes: inserted.newNotes,
    factId: inserted.factId,
    alreadyTagged: false,
    createdFact: false,
  };
}

function findFactByName(
  parsed: ParsedNotes,
  name: string,
): string | null {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  for (const fact of parsed.factsById.values()) {
    if (fact.name.trim().toLowerCase() === target) return fact.factId;
  }
  return null;
}

/**
 * Tag a symbol with a new Fact created from a freeform name. If a Fact with
 * the same (case-insensitive) name already exists, the symbol is tagged
 * against that existing Fact instead of duplicating the heading.
 *
 * The new heading is appended at the end of the doc. Section-aware insertion
 * (under the current cursor's section) is Phase 7+.
 */
export function tagSymbolWithNewFact(
  notes: string,
  parsed: ParsedNotes,
  symbolId: string,
  factName: string,
): TagResult {
  const trimmed = factName.trim();
  if (!trimmed || trimmed === UNASSIGNED_FACT_NAME) {
    return {
      newNotes: notes,
      factId: "",
      alreadyTagged: false,
      createdFact: false,
    };
  }

  // Reuse if a Fact with the same name already exists.
  const existingId = findFactByName(parsed, trimmed);
  if (existingId) {
    return tagSymbolWithFact(notes, parsed, symbolId, existingId);
  }

  // Append a new `## name` heading, then re-parse to grab synthesized factId.
  let prefix = notes;
  let separator: string;
  if (prefix.length === 0) {
    separator = "";
  } else {
    // Trim trailing whitespace, ensure exactly one blank line before heading.
    prefix = prefix.slice(0, trimTrailingWs(prefix));
    separator = prefix.length === 0 ? "" : "\n\n";
  }
  const withHeading = `${prefix}${separator}## ${trimmed}\n`;
  const reparsed = parseNotes(withHeading);
  const newFactId = findFactByName(reparsed, trimmed);
  if (!newFactId) {
    // Should not happen — heading is well-formed. Bail safely.
    return {
      newNotes: notes,
      factId: "",
      alreadyTagged: false,
      createdFact: false,
    };
  }
  const inserted = insertSymbolBullet(
    withHeading,
    reparsed,
    newFactId,
    symbolId,
  );
  return {
    newNotes: inserted.newNotes,
    factId: inserted.factId,
    alreadyTagged: false,
    createdFact: true,
  };
}

export interface BatchTagResult {
  newNotes: string;
  factId: string;
  /** True if a brand-new heading was synthesized at the start of the batch. */
  createdFact: boolean;
  /** Number of symbols that actually wrote a new bullet (skipping idempotent). */
  written: number;
}

/**
 * Batch variant of `tagSymbolWithFact` that avoids re-parsing notes after
 * every successful tag. The single-symbol fast path through `insertAtFactEnd`
 * lets us shift offsets and register the new symbolRef incrementally on the
 * existing `parsed` structure.
 *
 * Behaviorally equivalent to looping `tagSymbolWithFact` + `parseNotes` per
 * symbol (which is what the canvas-slice used to do).
 */
export function tagSymbolsWithFact(
  notes: string,
  parsed: ParsedNotes,
  symbolIds: readonly string[],
  factId: string,
): BatchTagResult {
  let cur = notes;
  let written = 0;
  if (!parsed.factsById.has(factId)) {
    return { newNotes: cur, factId, createdFact: false, written: 0 };
  }
  for (const symbolId of symbolIds) {
    if (isAlreadyTagged(parsed, symbolId, factId)) continue;
    const before = cur;
    const inserted = insertSymbolBullet(cur, parsed, factId, symbolId);
    if (inserted.newNotes === before) continue;
    const insertedAt = inserted.selection - (`* {sym:${symbolId}} `.length + 1);
    const insertedLen = inserted.newNotes.length - before.length;
    cur = inserted.newNotes;
    applyBulletInsertion(cur, parsed, factId, symbolId, insertedAt, insertedLen);
    written++;
  }
  return { newNotes: cur, factId, createdFact: false, written };
}

/**
 * Batch variant of `tagSymbolWithNewFact`: the first symbol may create the
 * heading (forcing one re-parse), then remaining symbols share the now-known
 * factId via the incremental fast path. No matter how many symbols are
 * passed, total parse cost is at most 2 (one to bootstrap, one inside the
 * heading-creation path) — vs N+1 for the previous loop.
 */
export function tagSymbolsWithNewFact(
  notes: string,
  parsed: ParsedNotes,
  symbolIds: readonly string[],
  factName: string,
): BatchTagResult {
  if (symbolIds.length === 0) {
    return { newNotes: notes, factId: "", createdFact: false, written: 0 };
  }
  const first = tagSymbolWithNewFact(notes, parsed, symbolIds[0], factName);
  const factId = first.factId;
  if (!factId) {
    return { newNotes: notes, factId: "", createdFact: false, written: 0 };
  }
  let cur = first.newNotes;
  let written = cur === notes ? 0 : 1;
  if (symbolIds.length > 1) {
    const curParsed = cur === notes ? parsed : parseNotes(cur);
    const rest = tagSymbolsWithFact(cur, curParsed, symbolIds.slice(1), factId);
    cur = rest.newNotes;
    written += rest.written;
  }
  return {
    newNotes: cur,
    factId,
    createdFact: first.createdFact,
    written,
  };
}
