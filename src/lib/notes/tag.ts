import {
  UNASSIGNED_FACT_NAME,
  type ParsedNotes,
} from "./types";
import { insertSymbolBullet } from "./insert";
import { parseNotes } from "./parse";

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
    let pos = prefix.length;
    while (pos > 0 && /\s/.test(prefix[pos - 1])) pos--;
    prefix = prefix.slice(0, pos);
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
