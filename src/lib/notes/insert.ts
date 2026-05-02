import {
  AUTO_FACT_ORDINAL_RE,
  AUTO_SECTION_ORDINAL_RE,
  UNASSIGNED_FACT_NAME,
  type ParsedFact,
  type ParsedNotes,
  type ParsedSection,
} from "./types";
import { parseNotes } from "./parse";

export interface InsertResult {
  newNotes: string;
  selection: number;
  factId: string;
}

export interface InsertSectionResult {
  newNotes: string;
  selection: number;
  sectionId: string;
}

export interface InsertFactResult {
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

// ---------------------------------------------------------------------------
// Section + Fact heading insertion (drives the right-panel tree's quick-add)
// ---------------------------------------------------------------------------

export function nextAutoSectionName(parsed: ParsedNotes): string {
  let max = 0;
  for (const section of parsed.sections) {
    const m = AUTO_SECTION_ORDINAL_RE.exec(section.name);
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `Section ${max + 1}`;
}

/**
 * End-of-section character offset: start of the next section's heading, or
 * the doc length if this is the last section. Used as the insertion anchor
 * for new Facts within a section.
 */
function sectionEndOffset(parsed: ParsedNotes, sectionId: string): number {
  const idx = parsed.sections.findIndex((s) => s.sectionId === sectionId);
  if (idx === -1) return parsed.docLength;
  const next = parsed.sections[idx + 1];
  return next ? next.headingFrom : parsed.docLength;
}

/**
 * Append `# Name` at the end of the doc with appropriate spacing. Returns
 * the synthesized sectionId (re-derived by re-parsing) so the caller can
 * focus / scroll to the new row.
 */
export function insertSection(
  notes: string,
  parsed: ParsedNotes,
  name?: string,
): InsertSectionResult {
  const headingName = name?.trim() || nextAutoSectionName(parsed);
  const trimmedEnd = trimTrailingWs(notes, 0);
  const prefix = notes.slice(0, trimmedEnd);
  const separator = trimmedEnd === 0 ? "" : "\n\n";
  const heading = `# ${headingName}\n`;
  const insertion = `${separator}${heading}`;
  const newNotes = prefix + insertion;
  const reparsed = parseNotes(newNotes);
  // The freshly-inserted section is the last in the parsed list whose name
  // matches what we wrote. Searching by name + position avoids picking up
  // an existing same-named section earlier in the doc.
  const inserted = [...reparsed.sections]
    .reverse()
    .find((s) => s.name === headingName);
  return {
    newNotes,
    selection: prefix.length + insertion.length,
    sectionId: inserted?.sectionId ?? "",
  };
}

/**
 * Insert `## Name` under the given section (or as a top-level fact when
 * sectionId is null). Lands at the END of that section's existing facts so
 * users see the new fact appear in the natural reading position.
 */
export function insertFact(
  notes: string,
  parsed: ParsedNotes,
  sectionId: string | null,
  name?: string,
): InsertFactResult {
  const headingName = name?.trim() || nextAutoFactName(parsed);
  const heading = `## ${headingName}\n`;

  if (sectionId === null) {
    // Append as a top-level fact at end of doc.
    const trimmedEnd = trimTrailingWs(notes, 0);
    const prefix = notes.slice(0, trimmedEnd);
    const separator = trimmedEnd === 0 ? "" : "\n\n";
    const insertion = `${separator}${heading}`;
    const newNotes = prefix + insertion;
    const reparsed = parseNotes(newNotes);
    const inserted = [...reparsed.factsById.values()]
      .reverse()
      .find((f) => f.name === headingName && f.sectionId === null);
    return {
      newNotes,
      selection: prefix.length + insertion.length,
      factId: inserted?.factId ?? "",
    };
  }

  // Insert at end of the named section.
  const section = parsed.sections.find((s) => s.sectionId === sectionId);
  if (!section) {
    // Fallback to top-level append.
    return insertFact(notes, parsed, null, headingName);
  }
  // Anchor at the section boundary (start of next section, or doc end). We
  // insert a heading there with leading whitespace tuned to whether the
  // preceding char is a newline — gives us a blank-line gap between the
  // previous fact and the new heading without doubling up newlines when
  // the section already ended with one.
  const pos = sectionEndOffset(parsed, sectionId);
  const previousIsNewline = pos > 0 && notes[pos - 1] === "\n";
  const leading = previousIsNewline ? "\n" : "\n\n";
  const insertion = `${leading}${heading}`;
  const newNotes = notes.slice(0, pos) + insertion + notes.slice(pos);
  const reparsed = parseNotes(newNotes);
  // Pick the last fact in this section whose name matches (the one we just
  // wrote — same-named earlier facts get distinct factIds via occurrence).
  const reSection = reparsed.sections.find((s) => s.name === section.name);
  const inserted = reSection?.facts.findLast((f) => f.name === headingName);
  return {
    newNotes,
    selection: pos + insertion.length,
    factId: inserted?.factId ?? "",
  };
}

/**
 * Read the description text for a parsed symbol ref — the trailing chunk
 * after the chip on its bullet line. Empty string when the bullet is bare.
 */
export function readSymbolDescription(
  notes: string,
  ref: { end: number },
): string {
  const lineEnd = notes.indexOf("\n", ref.end);
  const slice = lineEnd === -1
    ? notes.slice(ref.end)
    : notes.slice(ref.end, lineEnd);
  return slice.trim();
}

// Re-export for callers that want to enumerate sections from the tree.
export type { ParsedSection };
