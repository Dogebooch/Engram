import type { ParsedFact, ParsedNotes } from "./types";
import { UNASSIGNED_FACT_NAME } from "./types";

export interface OrderOptions {
  /** Include facts with zero symbol refs. Default false. */
  includeEmpty?: boolean;
  /** Include the synthetic `## Unassigned` fact. Default false. */
  includeUnassigned?: boolean;
}

/**
 * Iterate facts in document order: root-level facts first (those before any
 * `# Section` heading), then each section's facts in their `##` order.
 *
 * By default, excludes:
 *   - The synthetic `## Unassigned` fact (organizational artifact, not a study unit).
 *   - Facts with zero symbol references (no anchor to render a hotspot at,
 *     and would be a dead step in Sequential mode).
 */
export function getOrderedFacts(
  parsed: ParsedNotes,
  opts: OrderOptions = {},
): ParsedFact[] {
  const { includeEmpty = false, includeUnassigned = false } = opts;
  const out: ParsedFact[] = [];

  const accept = (f: ParsedFact): boolean => {
    if (!includeUnassigned && f.name === UNASSIGNED_FACT_NAME) return false;
    if (!includeEmpty && f.symbolRefs.length === 0) return false;
    return true;
  };

  for (const f of parsed.rootFacts) {
    if (accept(f)) out.push(f);
  }
  for (const section of parsed.sections) {
    for (const f of section.facts) {
      if (accept(f)) out.push(f);
    }
  }
  return out;
}

/**
 * Map each symbol id to its chronological fact number — the 1-based ordinal of
 * the first ordered fact that references it. Symbols tagged in several facts get
 * the earliest fact's number; multiple symbols in one fact share that number.
 * Used by the editor canvas to label per-symbol number circles.
 */
export function symbolOrdinals(parsed: ParsedNotes): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = getOrderedFacts(parsed);
  for (let i = 0; i < ordered.length; i++) {
    for (const ref of ordered[i].symbolRefs) {
      if (!out.has(ref.symbolId)) out.set(ref.symbolId, i + 1);
    }
  }
  return out;
}
