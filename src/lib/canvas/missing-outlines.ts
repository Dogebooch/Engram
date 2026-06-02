import { parseBullet } from "@/lib/notes/bullet";
import type { ParsedNotes } from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { symbolHasOutline } from "./symbol-outline";

export interface MissingOutlineEntry {
  symbolId: string;
  factId: string;
  description: string | null;
}

function bulletDescriptionAt(notes: string, offset: number): string | null {
  const lineStart = notes.lastIndexOf("\n", offset - 1) + 1;
  let lineEnd = notes.indexOf("\n", offset);
  if (lineEnd === -1) lineEnd = notes.length;
  const desc = parseBullet(notes.slice(lineStart, lineEnd)).description.trim();
  return desc.length > 0 ? desc : null;
}

/** The bullet description text for a symbol id (first reference), or null. */
export function describeSymbol(
  notes: string,
  parsed: ParsedNotes,
  symbolId: string,
): string | null {
  for (const fact of parsed.factsById.values()) {
    const ref = fact.symbolRefs.find((r) => r.symbolId === symbolId);
    if (ref) return bulletDescriptionAt(notes, ref.start);
  }
  return null;
}

/**
 * Symbol bullets that have no traced-polygon outline yet, in author order,
 * de-duped by symbol id (a symbol tagged under several Facts is outlined once).
 * Joins parsed notes (which bullets exist) with the canvas layers (outline
 * geometry); a token with no layer counts as missing too.
 */
export function findMissingOutlines(
  notes: string,
  parsed: ParsedNotes,
  symbols: readonly SymbolLayer[],
): MissingOutlineEntry[] {
  const byId = new Map(symbols.map((s) => [s.id, s] as const));
  const seen = new Set<string>();
  const out: MissingOutlineEntry[] = [];
  for (const fact of parsed.factsById.values()) {
    for (const ref of fact.symbolRefs) {
      const id = ref.symbolId;
      if (seen.has(id)) continue;
      if (symbolHasOutline(byId.get(id))) continue;
      seen.add(id);
      out.push({
        symbolId: id,
        factId: fact.factId,
        description: bulletDescriptionAt(notes, ref.start),
      });
    }
  }
  return out;
}
