export interface ParsedSymbolRef {
  symbolId: string;
  start: number;
  end: number;
  bulletLine: number;
}

export interface ParsedFact {
  factId: string;
  name: string;
  sectionId: string | null;
  sectionName: string | null;
  headingLine: number;
  headingFrom: number;
  headingTo: number;
  bodyRange: { from: number; to: number };
  symbolRefs: ParsedSymbolRef[];
}

export interface ParsedSection {
  sectionId: string;
  name: string;
  headingLine: number;
  headingFrom: number;
  headingTo: number;
  facts: ParsedFact[];
}

export interface ParsedNotes {
  sections: ParsedSection[];
  rootFacts: ParsedFact[];
  factsById: Map<string, ParsedFact>;
  factsBySymbolId: Map<string, string[]>;
  unassignedFactId: string | null;
  docLength: number;
}

export const UNASSIGNED_FACT_NAME = "Unassigned";

// Matches the auto-generated ordinal heading shape `Fact N`.
// The auto-fact slot in a freshly parsed doc resolves to either
// a literal `Unassigned` heading (legacy docs) or the highest-ordinal
// `Fact N` heading (current behavior). See `parse.ts`.
export const AUTO_FACT_ORDINAL_RE = /^Fact (\d+)$/;

// Symmetric pattern for auto-generated section headings.
export const AUTO_SECTION_ORDINAL_RE = /^Section (\d+)$/;
