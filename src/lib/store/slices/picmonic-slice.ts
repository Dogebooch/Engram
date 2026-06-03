import type { StateCreator } from "zustand";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { newId } from "@/lib/id";
import { clearCrashMirror } from "@/lib/storage/crash-mirror";
import { emptyCanvas, normalizeCanvas } from "@/lib/types/canvas";
import type { CanvasState } from "@/lib/types/canvas";
import {
  normalizeMeta,
  type NotesDoc,
  type Picmonic,
  type SaveStatus,
} from "@/lib/types/picmonic";
import { entryFromPicmonic, useIndexStore } from "../index-store";
import type { RootState } from "../types";

function normalizePicmonic(p: Picmonic): Picmonic {
  const canvas = normalizeCanvas(p.canvas);
  const meta = normalizeMeta(p.meta);
  if (canvas === p.canvas && meta === p.meta) return p;
  return { ...p, canvas, meta };
}

export type LoadResult = "loaded" | "missing" | "error";

export interface PicmonicSlice {
  picmonics: Record<string, Picmonic>;
  currentPicmonicId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  /**
   * IDs of picmonics created or imported during this app session — used to
   * decide whether to surface the review-before-exit modal when the user
   * navigates home. Cleared by `markSessionReviewed` (Save and exit / Discard).
   * Not persisted; rebuilt each session.
   */
  sessionPicmonicIds: Record<string, boolean>;
  createPicmonic: (initialName?: string) => string;
  setCurrentPicmonic: (id: string | null) => void;
  renamePicmonic: (id: string, name: string) => void;
  setPicmonicTags: (id: string, tags: string[]) => void;
  deletePicmonic: (id: string) => Promise<void>;
  duplicatePicmonic: (id: string) => Promise<string | null>;
  loadPicmonicById: (id: string) => Promise<LoadResult>;
  setSaveStatus: (status: SaveStatus) => void;
  setLastSavedAt: (ts: number | null) => void;
  hydratePicmonic: (picmonic: Picmonic) => void;
  /** Flag a picmonic as imported/created-this-session for the review modal. */
  markSessionPicmonic: (id: string) => void;
  /** Clear the session flag (called after the user has reviewed + decided). */
  markSessionReviewed: (id: string) => void;
  setNotes: (id: string, notes: NotesDoc) => void;
  setCanvas: (id: string, canvas: CanvasState) => void;
}

function makePicmonic(name: string): Picmonic {
  const now = Date.now();
  return {
    id: newId(),
    meta: { name, tags: [], createdAt: now, updatedAt: now, source: "generated" },
    notes: "",
    canvas: emptyCanvas(),
  };
}

function dedupTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export const createPicmonicSlice: StateCreator<RootState, [], [], PicmonicSlice> = (set, get) => ({
  picmonics: {},
  currentPicmonicId: null,
  saveStatus: "idle",
  lastSavedAt: null,
  sessionPicmonicIds: {},
  createPicmonic: (initialName = "Untitled Picmonic") => {
    const p = makePicmonic(initialName);
    set((s) => ({
      picmonics: { ...s.picmonics, [p.id]: p },
      currentPicmonicId: p.id,
      sessionPicmonicIds: { ...s.sessionPicmonicIds, [p.id]: true },
      ui: { ...s.ui, rightCollapsed: true },
    }));
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(p, null));
    void idbSet(picmonicKey(p.id), p).catch((err) => {
      console.error("[engram] placeholder write failed", err);
    });
    return p.id;
  },
  setCurrentPicmonic: (id) => set({ currentPicmonicId: id }),
  renamePicmonic: (id, name) =>
    set((s) => {
      const existing = s.picmonics[id];
      if (!existing) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [id]: {
            ...existing,
            meta: { ...existing.meta, name, updatedAt: Date.now() },
          },
        },
      };
    }),
  setPicmonicTags: (id, tags) =>
    set((s) => {
      const existing = s.picmonics[id];
      if (!existing) return s;
      const next = dedupTags(tags);
      return {
        picmonics: {
          ...s.picmonics,
          [id]: {
            ...existing,
            meta: { ...existing.meta, tags: next, updatedAt: Date.now() },
          },
        },
      };
    }),
  deletePicmonic: async (id) => {
    const existed = Boolean(get().picmonics[id]);
    set((s) => {
      const { [id]: _removed, ...rest } = s.picmonics;
      void _removed;
      const { [id]: _session, ...restSession } = s.sessionPicmonicIds;
      void _session;
      return {
        picmonics: rest,
        sessionPicmonicIds: restSession,
        currentPicmonicId: s.currentPicmonicId === id ? null : s.currentPicmonicId,
      };
    });
    useIndexStore.getState().removeIndexEntry(id);
    clearCrashMirror(id);
    if (existed) {
      try {
        await idbDel(picmonicKey(id));
      } catch (err) {
        console.error("[engram] delete idb failed", err);
      }
    } else {
      try {
        await idbDel(picmonicKey(id));
      } catch {
        /* noop */
      }
    }
  },
  duplicatePicmonic: async (id) => {
    let source: Picmonic | undefined = get().picmonics[id];
    if (!source) {
      try {
        source = (await idbGet<Picmonic>(picmonicKey(id))) ?? undefined;
      } catch {
        source = undefined;
      }
    }
    if (!source) return null;
    const now = Date.now();
    const copy: Picmonic = {
      id: newId(),
      meta: {
        name: `${source.meta.name} (copy)`,
        tags: [...(source.meta.tags ?? [])],
        createdAt: now,
        updatedAt: now,
        source: "generated",
      },
      notes: source.notes,
      canvas: source.canvas,
    };
    set((s) => ({ picmonics: { ...s.picmonics, [copy.id]: copy } }));
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(copy, null));
    void idbSet(picmonicKey(copy.id), copy).catch((err) => {
      console.error("[engram] duplicate placeholder write failed", err);
    });
    return copy.id;
  },
  loadPicmonicById: async (id) => {
    if (get().picmonics[id]) {
      set({ currentPicmonicId: id });
      return "loaded";
    }
    try {
      const raw = await idbGet<Picmonic>(picmonicKey(id));
      if (!raw) return "missing";
      const data = normalizePicmonic(raw);
      set((s) => ({
        picmonics: { ...s.picmonics, [data.id]: data },
        currentPicmonicId: data.id,
      }));
      return "loaded";
    } catch (err) {
      console.error("[engram] load picmonic failed", err);
      return "error";
    }
  },
  setSaveStatus: (status) => set({ saveStatus: status }),
  setLastSavedAt: (ts) => set({ lastSavedAt: ts }),
  hydratePicmonic: (picmonic) => {
    const normalized = normalizePicmonic(picmonic);
    const isImport = normalized.meta.source === "imported";
    set((s) => ({
      picmonics: { ...s.picmonics, [normalized.id]: normalized },
      sessionPicmonicIds: isImport
        ? { ...s.sessionPicmonicIds, [normalized.id]: true }
        : s.sessionPicmonicIds,
    }));
  },
  markSessionPicmonic: (id) => {
    set((s) => ({
      sessionPicmonicIds: { ...s.sessionPicmonicIds, [id]: true },
    }));
  },
  markSessionReviewed: (id) => {
    set((s) => {
      const { [id]: _drop, ...rest } = s.sessionPicmonicIds;
      void _drop;
      return { sessionPicmonicIds: rest };
    });
  },
  setNotes: (id, notes) =>
    set((s) => {
      const existing = s.picmonics[id];
      if (!existing) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [id]: { ...existing, notes, meta: { ...existing.meta, updatedAt: Date.now() } },
        },
      };
    }),
  setCanvas: (id, canvas) =>
    set((s) => {
      const existing = s.picmonics[id];
      if (!existing) return s;
      return {
        picmonics: {
          ...s.picmonics,
          [id]: { ...existing, canvas, meta: { ...existing.meta, updatedAt: Date.now() } },
        },
      };
    }),
});
