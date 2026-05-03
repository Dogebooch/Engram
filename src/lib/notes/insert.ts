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

// ---------------------------------------------------------------------------
// Phase 8.1 mutations — small string-replace helpers used by the chip context
// menu, sidebar row actions, description popover, and drag-drop reorder.
// All round-trip through `setNotes` so undo/redo via CodeMirror history is
// preserved (one transaction per call).
// ---------------------------------------------------------------------------

function lineBoundsAt(notes: string, offset: number): { start: number; end: number } {
  let start = offset;
  while (start > 0 && notes[start - 1] !== "\n") start--;
  let end = notes.indexOf("\n", offset);
  if (end === -1) end = notes.length;
  return { start, end };
}

/**
 * Remove the bullet line that contains the given symbol ref. The canvas
 * layer is untouched — only the textual reference is dropped. Strips one
 * trailing newline (the bullet's own line terminator) so neighbouring
 * spacing stays clean.
 */
export function untagSymbolFromFact(
  notes: string,
  ref: { start: number; end: number },
): string {
  const { start, end } = lineBoundsAt(notes, ref.start);
  // Eat the line's terminator if present so we don't leave a blank gap.
  const cut = end < notes.length && notes[end] === "\n" ? end + 1 : end;
  return notes.slice(0, start) + notes.slice(cut);
}

/**
 * Replace every `{sym:OLD}` chip in the doc with `{sym:NEW}`. Used by the
 * "swap broken chip" flow (oldUuid keeps; ref re-points on canvas) and by
 * "Replace symbol…" flow (rewrite the chip's UUID to a freshly-spawned
 * canvas symbol).
 */
export function replaceSymbolUuid(
  notes: string,
  oldUuid: string,
  newUuid: string,
): string {
  if (oldUuid === newUuid) return notes;
  const re = new RegExp(
    `\\{sym:${oldUuid.replace(/[-]/g, "\\-")}\\}`,
    "gi",
  );
  return notes.replace(re, `{sym:${newUuid}}`);
}

/**
 * Set (or clear) the per-bullet description for a symbol ref. Replaces the
 * trailing chunk after the chip up to end-of-line with a single space and
 * the new description (trimmed). Empty description leaves a bare bullet.
 */
export function setSymbolDescription(
  notes: string,
  ref: { end: number },
  description: string,
): string {
  const lineEnd = notes.indexOf("\n", ref.end);
  const cut = lineEnd === -1 ? notes.length : lineEnd;
  const trimmed = description.trim();
  const tail = trimmed.length > 0 ? ` ${trimmed}` : "";
  return notes.slice(0, ref.end) + tail + notes.slice(cut);
}

/**
 * Remove every bullet line that contains a chip referencing the given UUID.
 * Used by "Delete symbol entirely" — pairs with deleting the canvas layer.
 */
export function removeAllSymbolReferences(
  notes: string,
  uuid: string,
): string {
  const re = new RegExp(
    `\\{sym:${uuid.replace(/[-]/g, "\\-")}\\}`,
    "gi",
  );
  let out = notes;
  // Iterate matches via regex; collect bullet line spans, remove right-to-left
  // so earlier offsets stay valid.
  const cuts: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(notes))) {
    const { start, end } = lineBoundsAt(notes, m.index);
    const cutEnd = end < notes.length && notes[end] === "\n" ? end + 1 : end;
    // Coalesce adjacent matches on the same line.
    const last = cuts[cuts.length - 1];
    if (last && last.start === start) continue;
    cuts.push({ start, end: cutEnd });
  }
  for (let i = cuts.length - 1; i >= 0; i--) {
    const { start, end } = cuts[i];
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Drag-drop reorder helpers. Every move = one string surgery + one
 * `setNotes`, so CodeMirror history yields a single Ctrl+Z step per drop.
 * ------------------------------------------------------------------------- */

export type FactDropTarget =
  | { kind: "before-fact"; factId: string }
  | { kind: "section-end"; sectionId: string | null };

export type SectionDropTarget =
  | { kind: "before-section"; sectionId: string }
  | { kind: "doc-end" };

/**
 * Slice covering a fact's full markdown extent — heading line + body. Trims
 * any leading newlines so the slice can be reinserted at any anchor without
 * doubling spacing. The trailing newline (if any) is preserved so the next
 * sibling stays on its own line.
 */
function factSlice(notes: string, fact: ParsedFact): {
  from: number;
  to: number;
  text: string;
} {
  // Walk back over leading whitespace before the heading so we lift any
  // blank-line gap that belonged to this fact.
  let from = fact.headingFrom;
  while (from > 0 && (notes[from - 1] === " " || notes[from - 1] === "\t")) {
    from--;
  }
  // Lift one preceding newline if this isn't the very first heading — the
  // blank-line separator between facts. Don't double-lift.
  if (from > 0 && notes[from - 1] === "\n") from--;
  let to = fact.bodyRange.to;
  // Eat trailing whitespace inside the body but stop at the final newline.
  while (to > fact.headingTo && /[ \t]/.test(notes[to - 1] ?? "")) to--;
  return { from, to, text: notes.slice(from, to) };
}

/**
 * End-of-section character offset: start of the next section's heading, or
 * the doc length if this is the last section. (Internal duplicate of the
 * private helper above — exported indirectly via the drop helpers.)
 */
function sectionEndOffsetExt(
  parsed: ParsedNotes,
  sectionId: string,
): number {
  const idx = parsed.sections.findIndex((s) => s.sectionId === sectionId);
  if (idx === -1) return parsed.docLength;
  const next = parsed.sections[idx + 1];
  return next ? next.headingFrom : parsed.docLength;
}

/**
 * Move a fact to a new position in the document. The destination is either
 * "before sibling X" or "at the end of section Y" (which may be null for
 * root-level / doc-end). Returns the new notes string.
 *
 * No-op when source and destination resolve to the same insertion point.
 */
export function moveFact(
  notes: string,
  parsed: ParsedNotes,
  factId: string,
  target: FactDropTarget,
): string {
  const fact = parsed.factsById.get(factId);
  if (!fact) return notes;

  const { from, to, text } = factSlice(notes, fact);

  // Resolve destination offset BEFORE removal.
  let destOffset: number;
  if (target.kind === "before-fact") {
    const destFact = parsed.factsById.get(target.factId);
    if (!destFact || destFact.factId === factId) return notes;
    destOffset = factSlice(notes, destFact).from;
  } else {
    const sectionId = target.sectionId;
    if (sectionId === null) {
      destOffset = parsed.docLength;
    } else {
      destOffset = sectionEndOffsetExt(parsed, sectionId);
    }
    // Trim trailing whitespace at the section boundary so we drop a single
    // newline before the new fact.
    while (
      destOffset > 0 &&
      (notes[destOffset - 1] === " " || notes[destOffset - 1] === "\t")
    ) {
      destOffset--;
    }
  }

  // Same place? bail.
  if (destOffset >= from && destOffset <= to) return notes;

  // Remove the source slice, then reinsert at adjusted destination.
  const removed = notes.slice(0, from) + notes.slice(to);
  const adjustedDest = destOffset > to ? destOffset - (to - from) : destOffset;

  // The lifted slice always starts with a newline (we ate one before the
  // heading). When inserting at offset 0 (top of doc), drop that leading
  // newline so we don't begin the doc with a blank line.
  let payload = text;
  if (adjustedDest === 0 && payload.startsWith("\n")) {
    payload = payload.slice(1);
    // Ensure the payload ends in a newline so the next sibling stays on its
    // own line.
    if (!payload.endsWith("\n")) payload = payload + "\n";
  }

  // Ensure the payload separates cleanly from what follows.
  const charBefore = removed[adjustedDest - 1];
  const charAt = removed[adjustedDest];
  let prefix = "";
  if (charBefore !== undefined && charBefore !== "\n" && !payload.startsWith("\n")) {
    prefix = "\n";
  }
  let suffix = "";
  if (charAt !== undefined && charAt !== "\n" && !payload.endsWith("\n")) {
    suffix = "\n";
  }

  return removed.slice(0, adjustedDest) + prefix + payload + suffix + removed.slice(adjustedDest);
}

/**
 * Move a section (and all its facts) to a new position. Sections are always
 * top-level so the destination is either before another section or at
 * doc-end.
 */
export function moveSection(
  notes: string,
  parsed: ParsedNotes,
  sectionId: string,
  target: SectionDropTarget,
): string {
  const section = parsed.sections.find((s) => s.sectionId === sectionId);
  if (!section) return notes;

  // Lift the section: heading + every following byte until the next section
  // heading (or doc end).
  let from = section.headingFrom;
  if (from > 0 && notes[from - 1] === "\n") from--;
  if (from > 0 && notes[from - 1] === "\n") from--;
  const to = sectionEndOffsetExt(parsed, sectionId);

  const text = notes.slice(from, to);

  let destOffset: number;
  if (target.kind === "before-section") {
    const destSection = parsed.sections.find(
      (s) => s.sectionId === target.sectionId,
    );
    if (!destSection || destSection.sectionId === sectionId) return notes;
    destOffset = destSection.headingFrom;
    if (destOffset > 0 && notes[destOffset - 1] === "\n") destOffset--;
    if (destOffset > 0 && notes[destOffset - 1] === "\n") destOffset--;
  } else {
    destOffset = parsed.docLength;
  }

  if (destOffset >= from && destOffset <= to) return notes;

  const removed = notes.slice(0, from) + notes.slice(to);
  const adjustedDest = destOffset > to ? destOffset - (to - from) : destOffset;

  // Normalize spacing: section blocks are separated by a single blank line.
  let payload = text.replace(/^\s+/, "").replace(/\s+$/, "") + "\n";
  if (adjustedDest > 0) {
    payload = "\n\n" + payload;
  }

  const tail = removed.slice(adjustedDest);
  // Avoid 3+ consecutive newlines after our payload.
  const cleanedTail = tail.replace(/^\n+/, tail.startsWith("\n") ? "\n" : "");

  return removed.slice(0, adjustedDest) + payload + cleanedTail;
}

/**
 * Delete a fact heading and its body in one slice. Eats one preceding
 * newline so the surrounding spacing stays clean. No-op when factId is
 * unknown.
 */
export function deleteFact(
  notes: string,
  parsed: ParsedNotes,
  factId: string,
): string {
  const fact = parsed.factsById.get(factId);
  if (!fact) return notes;
  let from = fact.headingFrom;
  // Lift one preceding newline + one further if a blank-line gap was the
  // separator (keeps ## A\n\n## B → ## A after deleting B).
  if (from > 0 && notes[from - 1] === "\n") from--;
  if (from > 0 && notes[from - 1] === "\n") from--;
  const to = fact.bodyRange.to;
  return notes.slice(0, from) + notes.slice(to);
}

/**
 * Insert a new section heading immediately above the given fact. The fact
 * becomes the first fact of the new section. If factId is unknown, falls
 * back to appending at doc end via `insertSection`.
 */
export function insertSectionAbove(
  notes: string,
  parsed: ParsedNotes,
  factId: string,
  name?: string,
): InsertSectionResult {
  const fact = parsed.factsById.get(factId);
  if (!fact) return insertSection(notes, parsed, name);
  const headingName = name?.trim() || nextAutoSectionName(parsed);
  const insertion = `# ${headingName}\n\n`;
  const newNotes =
    notes.slice(0, fact.headingFrom) + insertion + notes.slice(fact.headingFrom);
  const reparsed = parseNotes(newNotes);
  const inserted = reparsed.sections.find((s) => s.name === headingName);
  return {
    newNotes,
    selection: fact.headingFrom + insertion.length,
    sectionId: inserted?.sectionId ?? "",
  };
}

/**
 * Rename a fact heading in place. Replaces the heading slice
 * [headingFrom, headingTo) with `## ${name}`. Empty or whitespace-only
 * names return notes unchanged so the caller's inline edit reverts cleanly.
 * Identity is by factId — two facts with the same name in different
 * sections get distinct ids via parse.ts's occurrence counting.
 */
export function setFactName(
  notes: string,
  parsed: ParsedNotes,
  factId: string,
  name: string,
): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return notes;
  const fact = parsed.factsById.get(factId);
  if (!fact) return notes;
  const heading = `## ${trimmed}`;
  const next =
    notes.slice(0, fact.headingFrom) + heading + notes.slice(fact.headingTo);
  return next === notes ? notes : next;
}

/**
 * Rename a section heading in place. Same shape as `setFactName` — replaces
 * the heading slice with `# ${name}`. Empty name = no-op.
 */
export function setSectionName(
  notes: string,
  parsed: ParsedNotes,
  sectionId: string,
  name: string,
): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return notes;
  const section = parsed.sections.find((s) => s.sectionId === sectionId);
  if (!section) return notes;
  const heading = `# ${trimmed}`;
  const next =
    notes.slice(0, section.headingFrom) +
    heading +
    notes.slice(section.headingTo);
  return next === notes ? notes : next;
}

// Re-export for callers that want to enumerate sections from the tree.
export type { ParsedSection };
