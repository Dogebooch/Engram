import { parseNotes } from "./parse";
import type { ParsedNotes } from "./types";

export type MoveFactAnchor =
  | { type: "before-fact"; factId: string }
  | { type: "section-end"; sectionId: string | null };

export interface MoveFactResult {
  newNotes: string;
  ok: boolean;
}

function spliceBlockIn(text: string, offset: number, block: string): string {
  const needLead = offset > 0 && text[offset - 1] !== "\n";
  const insertion = `${needLead ? "\n" : ""}${block}\n`;
  return text.slice(0, offset) + insertion + text.slice(offset);
}

function resolveOffset(
  removed: string,
  p1: ParsedNotes,
  anchor: MoveFactAnchor,
): number | null {
  if (anchor.type === "before-fact") {
    const t = p1.factsById.get(anchor.factId);
    return t ? t.headingFrom : null;
  }
  // section-end
  if (anchor.sectionId == null) {
    if (p1.rootFacts.length > 0) {
      return p1.rootFacts[p1.rootFacts.length - 1].bodyRange.to;
    }
    if (p1.sections.length > 0) return p1.sections[0].headingFrom;
    return removed.length;
  }
  const sec = p1.sections.find((s) => s.sectionId === anchor.sectionId);
  if (!sec) return null;
  return sec.facts.length > 0
    ? sec.facts[sec.facts.length - 1].bodyRange.to
    : sec.headingTo;
}

/**
 * Relocate a whole `## Fact` block (heading + its bullets) to a new position —
 * before another fact, or appended to the end of a section (or the root region).
 * Pure; re-parses once after removal to resolve the destination offset.
 */
export function moveFact(
  notes: string,
  parsed: ParsedNotes,
  factId: string,
  anchor: MoveFactAnchor,
): MoveFactResult {
  const fact = parsed.factsById.get(factId);
  if (!fact) return { newNotes: notes, ok: false };
  if (anchor.type === "before-fact" && anchor.factId === factId) {
    return { newNotes: notes, ok: true };
  }

  const block = notes.slice(fact.headingFrom, fact.bodyRange.to).replace(/\s+$/, "");
  if (!block) return { newNotes: notes, ok: false };

  const removed = notes.slice(0, fact.headingFrom) + notes.slice(fact.bodyRange.to);
  const p1 = parseNotes(removed);
  const offset = resolveOffset(removed, p1, anchor) ?? removed.length;
  return { newNotes: spliceBlockIn(removed, offset, block), ok: true };
}
