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
