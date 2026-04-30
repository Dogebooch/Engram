import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import type { Root, Heading, List, Text, ListItem } from "mdast";
import type { Position } from "unist";
import { synthesizeFactId, synthesizeSectionId } from "./fact-id";
import {
  UNASSIGNED_FACT_NAME,
  type ParsedFact,
  type ParsedNotes,
  type ParsedSection,
  type ParsedSymbolRef,
} from "./types";

const SYM_TOKEN_RE =
  /\{sym:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}/gi;

const processor = unified().use(remarkParse);

interface ParseState {
  sections: ParsedSection[];
  rootFacts: ParsedFact[];
  factsById: Map<string, ParsedFact>;
  factsBySymbolId: Map<string, string[]>;
  factOccurrence: Map<string, number>;
  sectionOccurrence: Map<string, number>;
  currentSection: ParsedSection | null;
  currentFact: ParsedFact | null;
  unassignedFactId: string | null;
  docLength: number;
}

function headingText(node: Heading): string {
  return node.children
    .map((c) => ("value" in c && typeof c.value === "string" ? c.value : ""))
    .join("")
    .trim();
}

function startEnd(pos: Position | undefined): { from: number; to: number } | null {
  if (!pos || pos.start.offset == null || pos.end.offset == null) return null;
  return { from: pos.start.offset, to: pos.end.offset };
}

function closeFact(state: ParseState, endOffset: number): void {
  if (!state.currentFact) return;
  state.currentFact.bodyRange.to = endOffset;
  state.currentFact = null;
}

function openFact(
  state: ParseState,
  name: string,
  heading: Heading,
): void {
  const range = startEnd(heading.position);
  if (!range) return;
  const sectionName = state.currentSection?.name ?? null;
  const occKey = `${sectionName ?? "_"}::${name}`;
  const occ = state.factOccurrence.get(occKey) ?? 0;
  state.factOccurrence.set(occKey, occ + 1);
  const factId = synthesizeFactId(sectionName, name, occ);
  const fact: ParsedFact = {
    factId,
    name,
    sectionId: state.currentSection?.sectionId ?? null,
    sectionName,
    headingLine: heading.position?.start.line ?? 0,
    headingFrom: range.from,
    headingTo: range.to,
    bodyRange: { from: range.to, to: state.docLength },
    symbolRefs: [],
  };
  if (state.currentSection) {
    state.currentSection.facts.push(fact);
  } else {
    state.rootFacts.push(fact);
  }
  state.factsById.set(factId, fact);
  state.currentFact = fact;
  if (name === UNASSIGNED_FACT_NAME && state.unassignedFactId == null) {
    state.unassignedFactId = factId;
  }
}

function openSection(state: ParseState, name: string, heading: Heading): void {
  const range = startEnd(heading.position);
  if (!range) return;
  const occ = state.sectionOccurrence.get(name) ?? 0;
  state.sectionOccurrence.set(name, occ + 1);
  const sectionId = synthesizeSectionId(name, occ);
  const section: ParsedSection = {
    sectionId,
    name,
    headingLine: heading.position?.start.line ?? 0,
    headingFrom: range.from,
    headingTo: range.to,
    facts: [],
  };
  state.sections.push(section);
  state.currentSection = section;
}

function scanListForSymbolRefs(
  list: List,
  state: ParseState,
): void {
  if (!state.currentFact) return;
  const fact = state.currentFact;
  for (const item of list.children) {
    scanListItemForSymbolRefs(item, fact, state);
  }
}

function scanListItemForSymbolRefs(
  item: ListItem,
  fact: ParsedFact,
  state: ParseState,
): void {
  const bulletLine = item.position?.start.line ?? 0;
  visit(item, "text", (node: Text) => {
    if (!node.position?.start.offset && node.position?.start.offset !== 0) return;
    const baseOffset = node.position.start.offset;
    const value = node.value;
    SYM_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SYM_TOKEN_RE.exec(value))) {
      const tokenStart = baseOffset + m.index;
      const tokenEnd = tokenStart + m[0].length;
      const symbolId = m[1].toLowerCase();
      const ref: ParsedSymbolRef = {
        symbolId,
        start: tokenStart,
        end: tokenEnd,
        bulletLine,
      };
      fact.symbolRefs.push(ref);
      const arr = state.factsBySymbolId.get(symbolId) ?? [];
      if (!arr.includes(fact.factId)) {
        arr.push(fact.factId);
        state.factsBySymbolId.set(symbolId, arr);
      }
    }
  });
}

export function parseNotes(notes: string): ParsedNotes {
  const tree = processor.parse(notes) as Root;
  const state: ParseState = {
    sections: [],
    rootFacts: [],
    factsById: new Map(),
    factsBySymbolId: new Map(),
    factOccurrence: new Map(),
    sectionOccurrence: new Map(),
    currentSection: null,
    currentFact: null,
    unassignedFactId: null,
    docLength: notes.length,
  };

  const children = tree.children;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type === "heading" && (node.depth === 1 || node.depth === 2)) {
      const heading = node;
      const text = headingText(heading);
      const headingStart = heading.position?.start.offset ?? state.docLength;
      // close any open fact at the start of this new heading
      closeFact(state, headingStart);
      if (heading.depth === 1) {
        state.currentSection = null;
        if (text) openSection(state, text, heading);
      } else {
        if (text) openFact(state, text, heading);
      }
      continue;
    }
    if (node.type === "list") {
      scanListForSymbolRefs(node, state);
      continue;
    }
  }

  // Finalize any trailing fact bodyRange
  if (state.currentFact) {
    state.currentFact.bodyRange.to = state.docLength;
  }

  return {
    sections: state.sections,
    rootFacts: state.rootFacts,
    factsById: state.factsById,
    factsBySymbolId: state.factsBySymbolId,
    unassignedFactId: state.unassignedFactId,
    docLength: state.docLength,
  };
}

export function findFactAtOffset(
  parsed: ParsedNotes,
  offset: number,
): ParsedFact | null {
  for (const fact of parsed.factsById.values()) {
    if (offset >= fact.headingFrom && offset <= fact.bodyRange.to) {
      return fact;
    }
  }
  return null;
}

export function findSymbolRefsOnLine(
  parsed: ParsedNotes,
  line: number,
): ParsedSymbolRef[] {
  const out: ParsedSymbolRef[] = [];
  for (const fact of parsed.factsById.values()) {
    for (const ref of fact.symbolRefs) {
      if (ref.bulletLine === line) out.push(ref);
    }
  }
  return out;
}

export function getAllFacts(parsed: ParsedNotes): ParsedFact[] {
  return Array.from(parsed.factsById.values());
}
