"use client";

import { create } from "zustand";
import {
  get as idbGet,
  set as idbSet,
  keys as idbKeys,
} from "idb-keyval";
import { IDB_KEYS } from "@/lib/constants";
import { debounce } from "@/lib/debounce";
import { newId } from "@/lib/id";
import { parseNotes } from "@/lib/notes/parse";
import { UNASSIGNED_FACT_NAME } from "@/lib/notes/types";
import type { Picmonic } from "@/lib/types/picmonic";
import type { FolderIndex, FolderNode } from "@/lib/types/folder";
import type {
  PicmonicIndex,
  PicmonicIndexEntry,
} from "@/lib/types/index-entry";

interface IndexState {
  index: PicmonicIndex | null;
  folders: FolderIndex | null;
  loading: boolean;
  loadIndex: () => Promise<void>;
  upsertIndexEntry: (entry: PicmonicIndexEntry) => void;
  updateIndexEntry: (
    id: string,
    patch: Partial<PicmonicIndexEntry>,
  ) => void;
  removeIndexEntry: (id: string) => void;
  createFolder: (name: string, parentId: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  moveFolder: (id: string, parentId: string | null) => boolean;
  deleteFolderNode: (id: string) => void;
}

let inFlightPersist: Promise<void> | null = null;
let inFlightFolderPersist: Promise<void> | null = null;

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

const persistFoldersDebounced = debounce((folders: FolderIndex) => {
  const task = idbSet(IDB_KEYS.folderIndex, folders)
    .catch((err: unknown) => {
      console.error("[engram] failed to persist folders", err);
    })
    .finally(() => {
      if (inFlightFolderPersist === task) inFlightFolderPersist = null;
    });
  inFlightFolderPersist = task;
}, 250);

/**
 * Flush any debounce-pending index write and await its completion. Used by
 * navigation (brand-button → home) and beforeunload so an in-flight 250ms
 * timer can't drop a metadata/thumbnail update.
 */
export async function flushIndexPersist(): Promise<void> {
  persistDebounced.flush();
  persistFoldersDebounced.flush();
  if (inFlightPersist) await inFlightPersist;
  if (inFlightFolderPersist) await inFlightFolderPersist;
}

export const useIndexStore = create<IndexState>((set, get) => ({
  index: null,
  folders: null,
  loading: false,
  loadIndex: async () => {
    if (get().loading || (get().index !== null && get().folders !== null)) return;
    set({ loading: true });
    try {
      const [stored, storedFolders] = await Promise.all([
        idbGet<PicmonicIndex>(IDB_KEYS.picmonicIndex),
        idbGet<FolderIndex>(IDB_KEYS.folderIndex),
      ]);
      const folders = normalizeFolders(storedFolders);
      if (stored && Array.isArray(stored)) {
        const normalized = normalizeIndex(stored);
        set({ index: normalized, folders, loading: false });
        if (normalized !== stored) persistDebounced(normalized);
        if (folders !== storedFolders) persistFoldersDebounced(folders);
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
      await Promise.all([
        idbSet(IDB_KEYS.picmonicIndex, seeded),
        idbSet(IDB_KEYS.folderIndex, folders),
      ]);
      set({ index: seeded, folders, loading: false });
    } catch (err) {
      console.error("[engram] failed to load index", err);
      set({ index: [], folders: [], loading: false });
    }
  },
  upsertIndexEntry: (entry) => {
    set((s) => {
      const cur = s.index ?? [];
      const normalizedEntry = normalizeIndexEntry(entry);
      const idx = cur.findIndex((e) => e.id === entry.id);
      const next = idx === -1 ? [normalizedEntry, ...cur] : cur.slice();
      if (idx !== -1) next[idx] = normalizedEntry;
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      persistDebounced(next);
      return { index: next };
    });
  },
  updateIndexEntry: (id, patch) => {
    set((s) => {
      const cur = s.index ?? [];
      const idx = cur.findIndex((e) => e.id === id);
      if (idx === -1) return s;
      const next = cur.slice();
      next[idx] = normalizeIndexEntry({ ...next[idx], ...patch });
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
  createFolder: (name, parentId) => {
    const now = Date.now();
    const clean = name.trim() || "New folder";
    const id = newId();
    set((s) => {
      const cur = s.folders ?? [];
      const siblings = cur.filter((f) => f.parentId === parentId);
      const node: FolderNode = {
        id,
        name: clean,
        parentId,
        sortOrder:
          siblings.reduce((max, f) => Math.max(max, f.sortOrder), -1) + 1,
        createdAt: now,
        updatedAt: now,
      };
      const next = sortFolders([...cur, node]);
      persistFoldersDebounced(next);
      return { folders: next };
    });
    return id;
  },
  renameFolder: (id, name) => {
    const clean = name.trim();
    if (!clean) return;
    set((s) => {
      const cur = s.folders ?? [];
      const next = sortFolders(
        cur.map((f) =>
          f.id === id ? { ...f, name: clean, updatedAt: Date.now() } : f,
        ),
      );
      persistFoldersDebounced(next);
      return { folders: next };
    });
  },
  moveFolder: (id, parentId) => {
    const cur = get().folders ?? [];
    if (id === parentId || isFolderDescendant(cur, parentId, id)) return false;
    set((s) => {
      const folders = s.folders ?? [];
      const siblings = folders.filter(
        (f) => f.parentId === parentId && f.id !== id,
      );
      const next = sortFolders(
        folders.map((f) =>
          f.id === id
            ? {
                ...f,
                parentId,
                sortOrder:
                  siblings.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1,
                updatedAt: Date.now(),
              }
            : f,
        ),
      );
      persistFoldersDebounced(next);
      return { folders: next };
    });
    return true;
  },
  deleteFolderNode: (id) => {
    set((s) => {
      const cur = s.folders ?? [];
      const deleted = cur.find((f) => f.id === id);
      const parentId = deleted?.parentId ?? null;
      const next = sortFolders(
        cur
          .filter((f) => f.id !== id)
          .map((f) =>
            f.parentId === id ? { ...f, parentId, updatedAt: Date.now() } : f,
          ),
      );
      persistFoldersDebounced(next);
      return { folders: next };
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
    folderId: p.meta.folderId ?? null,
    sourceVideo: p.meta.sourceVideo ?? null,
    createdAt: p.meta.createdAt,
    updatedAt: p.meta.updatedAt,
    thumbDataUrl,
    symbolCount: p.canvas.symbols.length,
    factCount,
  };
}

export function normalizeIndexEntry(
  entry: PicmonicIndexEntry,
): PicmonicIndexEntry {
  return {
    ...entry,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    folderId: entry.folderId ?? null,
    sourceVideo: entry.sourceVideo ?? null,
  };
}

export function normalizeIndex(index: PicmonicIndex): PicmonicIndex {
  let changed = false;
  const normalized = index.map((entry) => {
    const next = normalizeIndexEntry(entry);
    if (
      next !== entry ||
      next.folderId !== entry.folderId ||
      next.sourceVideo !== entry.sourceVideo
    ) {
      changed = true;
    }
    return next;
  });
  return changed ? normalized : index;
}

export function normalizeFolders(raw: unknown): FolderIndex {
  if (!Array.isArray(raw)) return [];
  return sortFolders(
    raw
      .filter((f): f is Partial<FolderNode> =>
        Boolean(f && typeof f === "object" && typeof f.id === "string"),
      )
      .map((f, idx) => ({
        id: f.id!,
        name: typeof f.name === "string" && f.name.trim() ? f.name.trim() : "Folder",
        parentId: typeof f.parentId === "string" ? f.parentId : null,
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : idx,
        createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now(),
        updatedAt: typeof f.updatedAt === "number" ? f.updatedAt : Date.now(),
      })),
  );
}

export function sortFolders(folders: FolderIndex): FolderIndex {
  return folders
    .slice()
    .sort(
      (a, b) =>
        (a.parentId ?? "").localeCompare(b.parentId ?? "") ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
}

export function collectDescendantFolderIds(
  folders: readonly FolderNode[],
  folderId: string,
): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    for (const child of folders) {
      if (child.parentId !== id) continue;
      out.push(child.id);
      visit(child.id);
    }
  };
  visit(folderId);
  return out;
}

export function isFolderDescendant(
  folders: readonly FolderNode[],
  maybeDescendantId: string | null,
  ancestorId: string,
): boolean {
  let cur = maybeDescendantId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return false;
}
