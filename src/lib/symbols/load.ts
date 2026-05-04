"use client";

import type { SymbolEntry } from "./types";

const SYMBOLS_URL = "/symbols.json";

const byId = new Map<string, SymbolEntry>();
let snapshot: SymbolEntry[] | null = null;
let inFlight: Promise<SymbolEntry[]> | null = null;
let baseLoaded = false;

let version = 0;
const listeners = new Set<() => void>();

function rebuildSnapshot(): void {
  const arr = Array.from(byId.values());
  arr.sort((a, b) => a.displayName.localeCompare(b.displayName));
  snapshot = arr;
}

function bump(): void {
  version += 1;
  rebuildSnapshot();
  for (const fn of listeners) fn();
}

async function fetchSymbols(): Promise<SymbolEntry[]> {
  const res = await fetch(SYMBOLS_URL, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(
      `Failed to load symbols.json (${res.status}). Run \`npm run symbols:build\` to regenerate.`,
    );
  }
  const data = (await res.json()) as SymbolEntry[];
  return data;
}

export function loadSymbols(): Promise<SymbolEntry[]> {
  if (baseLoaded && snapshot) return Promise.resolve(snapshot);
  if (inFlight) return inFlight;
  inFlight = fetchSymbols()
    .then((data) => {
      for (const e of data) byId.set(e.id, e);
      baseLoaded = true;
      rebuildSnapshot();
      bump();
      inFlight = null;
      return snapshot ?? [];
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

export function getCachedSymbols(): SymbolEntry[] | null {
  if (!baseLoaded) return null;
  return snapshot;
}

export function getSymbolById(id: string): SymbolEntry | undefined {
  return byId.get(id);
}

export function registerUserSymbols(entries: readonly SymbolEntry[]): void {
  if (entries.length === 0) return;
  for (const e of entries) byId.set(e.id, e);
  bump();
}

export function unregisterUserSymbol(id: string): void {
  if (!byId.delete(id)) return;
  bump();
}

export function getSymbolsVersion(): number {
  return version;
}

export function subscribeSymbols(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test-only: reset all caches/listeners between tests. */
export function __resetSymbolsCacheForTests(): void {
  byId.clear();
  snapshot = null;
  inFlight = null;
  baseLoaded = false;
  version = 0;
  listeners.clear();
}
