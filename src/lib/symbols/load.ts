"use client";

import type { SymbolEntry } from "./types";

const SYMBOLS_URL = "/symbols.json";

let cache: SymbolEntry[] | null = null;
let inFlight: Promise<SymbolEntry[]> | null = null;

async function fetchSymbols(): Promise<SymbolEntry[]> {
  const res = await fetch(SYMBOLS_URL, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(
      `Failed to load symbols.json (${res.status}). Run \`npm run symbols:build\` to regenerate.`,
    );
  }
  const data = (await res.json()) as SymbolEntry[];
  data.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return data;
}

export function loadSymbols(): Promise<SymbolEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = fetchSymbols()
    .then((data) => {
      cache = data;
      inFlight = null;
      return data;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

export function getCachedSymbols(): SymbolEntry[] | null {
  return cache;
}

export function getSymbolById(id: string): SymbolEntry | undefined {
  return cache?.find((s) => s.id === id);
}
