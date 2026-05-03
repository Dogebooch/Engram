"use client";

import { create } from "zustand";
import {
  get as idbGet,
  set as idbSet,
  keys as idbKeys,
} from "idb-keyval";
import { IDB_KEYS } from "@/lib/constants";
import { debounce } from "@/lib/debounce";
import { parseNotes } from "@/lib/notes/parse";
import { UNASSIGNED_FACT_NAME } from "@/lib/notes/types";
import type { Picmonic } from "@/lib/types/picmonic";
import type {
  PicmonicIndex,
  PicmonicIndexEntry,
} from "@/lib/types/index-entry";

interface IndexState {
  index: PicmonicIndex | null;
  loading: boolean;
  loadIndex: () => Promise<void>;
  upsertIndexEntry: (entry: PicmonicIndexEntry) => void;
  removeIndexEntry: (id: string) => void;
}

let inFlightPersist: Promise<void> | null = null;

const persistDebounced = debounce((index: PicmonicIndex) => {
  const task = idbSet(IDB_KEYS.picmonicIndex, index)
    .catch((err: unknown) => {
      console.error("[engram] failed to persist index", err);
    })
    .finally(() => {
      if (inFlightPersist === task) inFlightPersist = null;
    });
  inFlightPersist = task;
}, 250);

/**
 * Flush any debounce-pending index write and await its completion. Used by
 * navigation (brand-button → home) and beforeunload so an in-flight 250ms
 * timer can't drop a metadata/thumbnail update.
 */
export async function flushIndexPersist(): Promise<void> {
  persistDebounced.flush();
  if (inFlightPersist) await inFlightPersist;
}

export const useIndexStore = create<IndexState>((set, get) => ({
  index: null,
  loading: false,
  loadIndex: async () => {
    if (get().loading || get().index !== null) return;
    set({ loading: true });
    try {
      const stored = await idbGet<PicmonicIndex>(IDB_KEYS.picmonicIndex);
      if (stored && Array.isArray(stored)) {
        set({ index: stored, loading: false });
        return;
      }
      // Migration: scan all engram:picmonic:* records and seed.
      const allKeys = await idbKeys();
      const prefix = IDB_KEYS.picmonicPrefix;
      const seeded: PicmonicIndex = [];
      for (const k of allKeys) {
        if (typeof k !== "string" || !k.startsWith(prefix)) continue;
        const p = await idbGet<Picmonic>(k);
        if (!p || typeof p !== "object" || !("id" in p)) continue;
        seeded.push(entryFromPicmonic(p, null));
      }
      seeded.sort((a, b) => b.updatedAt - a.updatedAt);
      await idbSet(IDB_KEYS.picmonicIndex, seeded);
      set({ index: seeded, loading: false });
    } catch (err) {
      console.error("[engram] failed to load index", err);
      set({ index: [], loading: false });
    }
  },
  upsertIndexEntry: (entry) => {
    set((s) => {
      const cur = s.index ?? [];
      const idx = cur.findIndex((e) => e.id === entry.id);
      const next = idx === -1 ? [entry, ...cur] : cur.slice();
      if (idx !== -1) next[idx] = entry;
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      persistDebounced(next);
      return { index: next };
    });
  },
  removeIndexEntry: (id) => {
    set((s) => {
      const cur = s.index ?? [];
      const next = cur.filter((e) => e.id !== id);
      persistDebounced(next);
      return { index: next };
    });
  },
}));

export function entryFromPicmonic(
  p: Picmonic,
  thumbDataUrl: string | null,
): PicmonicIndexEntry {
  const parsed = parseNotes(p.notes ?? "");
  let factCount = 0;
  for (const f of parsed.factsById.values()) {
    if (f.name === UNASSIGNED_FACT_NAME) continue;
    if (f.symbolRefs.length === 0) continue;
    factCount += 1;
  }
  return {
    id: p.id,
    name: p.meta.name,
    tags: p.meta.tags ?? [],
    createdAt: p.meta.createdAt,
    updatedAt: p.meta.updatedAt,
    thumbDataUrl,
    symbolCount: p.canvas.symbols.length,
    factCount,
  };
}
