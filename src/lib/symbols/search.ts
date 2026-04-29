import type { SymbolEntry } from "./types";

const TOKEN_SPLIT = /[\s\-_]+/;

function tokenize(s: string): string[] {
  return s.toLowerCase().split(TOKEN_SPLIT).filter(Boolean);
}

interface PreparedEntry {
  entry: SymbolEntry;
  nameLower: string;
  nameTokens: string[];
  aliasTokens: string[];
  tagTokens: string[];
}

const prepCache = new WeakMap<SymbolEntry, PreparedEntry>();

function prep(entry: SymbolEntry): PreparedEntry {
  const cached = prepCache.get(entry);
  if (cached) return cached;
  const prepped: PreparedEntry = {
    entry,
    nameLower: entry.displayName.toLowerCase(),
    nameTokens: tokenize(entry.displayName),
    aliasTokens: entry.aliases.flatMap(tokenize),
    tagTokens: entry.tags.flatMap(tokenize),
  };
  prepCache.set(entry, prepped);
  return prepped;
}

const NO_MATCH = Number.NEGATIVE_INFINITY;

function scoreOne(p: PreparedEntry, qt: string): number {
  if (p.nameLower.startsWith(qt)) return 1000;
  if (p.nameTokens.some((t) => t.startsWith(qt))) return 800;
  if (p.aliasTokens.some((t) => t.startsWith(qt))) return 600;
  if (p.tagTokens.some((t) => t.startsWith(qt))) return 400;
  if (p.nameLower.includes(qt)) return 300;
  if (p.aliasTokens.some((t) => t.includes(qt))) return 200;
  return NO_MATCH;
}

export interface SearchOptions {
  limit?: number;
}

export function searchSymbols(
  symbols: readonly SymbolEntry[],
  rawQuery: string,
  opts: SearchOptions = {},
): SymbolEntry[] {
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const trimmed = rawQuery.trim();
  if (trimmed === "") {
    return limit < symbols.length ? symbols.slice(0, limit) : symbols.slice();
  }
  const queryTokens = tokenize(trimmed);
  if (queryTokens.length === 0) {
    return limit < symbols.length ? symbols.slice(0, limit) : symbols.slice();
  }

  type Hit = { entry: SymbolEntry; score: number; nameLen: number };
  const hits: Hit[] = [];
  for (const entry of symbols) {
    const p = prep(entry);
    let total = 0;
    let matchedAll = true;
    for (const qt of queryTokens) {
      const s = scoreOne(p, qt);
      if (s === NO_MATCH) {
        matchedAll = false;
        break;
      }
      total += s;
    }
    if (!matchedAll) continue;
    hits.push({ entry, score: total, nameLen: p.nameLower.length });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.nameLen !== b.nameLen) return a.nameLen - b.nameLen;
    if (a.entry.qualityRank !== b.entry.qualityRank) {
      return a.entry.qualityRank - b.entry.qualityRank;
    }
    return a.entry.displayName.localeCompare(b.entry.displayName);
  });

  if (limit < hits.length) hits.length = limit;
  return hits.map((h) => h.entry);
}
