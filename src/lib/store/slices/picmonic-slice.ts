import type { StateCreator } from "zustand";
import { del as idbDel, get as idbGet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { newId } from "@/lib/id";
import { emptyCanvas, normalizeCanvas } from "@/lib/types/canvas";
import type { CanvasState } from "@/lib/types/canvas";
import type {
  NotesDoc,
  Picmonic,
  SaveStatus,
} from "@/lib/types/picmonic";
import { entryFromPicmonic, useIndexStore } from "../index-store";
import type { RootState } from "../types";

function normalizePicmonic(p: Picmonic): Picmonic {
  const canvas = normalizeCanvas(p.canvas);
  return canvas === p.canvas ? p : { ...p, canvas };
}

/**
 * Lazy backwards-compat: scenes saved before backgrounds were indexed have
 * a `uploadedBlobId` that lives in the user-asset blob store but has no
 * entry in the asset index. On scene load, register it so it appears in
 * the Backgrounds library tab. Best-effort — failures are logged.
 */
async function maybeIndexBackdrop(picmonic: Picmonic | undefined): Promise<void> {
  const blobId = picmonic?.canvas.backdrop?.uploadedBlobId;
  if (!blobId) return;
  try {
    const { ensureBackdropIndexed } = await import(
      "@/lib/user-assets/backdrop-library"
    );
    await ensureBackdropIndexed(blobId);
  } catch (err) {
    console.warn("[engram] maybeIndexBackdrop failed", err);
  }
}

export interface PicmonicSlice {
  picmonics: Record<string, Picmonic>;
  currentPicmonicId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  createPicmonic: (initialName?: string) => string;
  setCurrentPicmonic: (id: string | null) => void;
  renamePicmonic: (id: string, name: string) => void;
  setPicmonicTags: (id: string, tags: string[]) => void;
  deletePicmonic: (id: string) => Promise<void>;
  duplicatePicmonic: (id: string) => Promise<string | null>;
  loadPicmonicById: (id: string) => Promise<boolean>;
  setSaveStatus: (status: SaveStatus) => void;
  setLastSavedAt: (ts: number | null) => void;
  hydratePicmonic: (picmonic: Picmonic) => void;
  setNotes: (id: string, notes: NotesDoc) => void;
  setCanvas: (id: string, canvas: CanvasState) => void;
}

function makePicmonic(name: string): Picmonic {
  const now = Date.now();
  return {
    id: newId(),
    meta: { name, tags: [], createdAt: now, updatedAt: now },
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
  createPicmonic: (initialName = "Untitled Picmonic") => {
    const p = makePicmonic(initialName);
    set((s) => ({
      picmonics: { ...s.picmonics, [p.id]: p },
      currentPicmonicId: p.id,
      ui: { ...s.ui, rightCollapsed: true },
    }));
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(p, null));
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
      return {
        picmonics: rest,
        currentPicmonicId: s.currentPicmonicId === id ? null : s.currentPicmonicId,
      };
    });
    useIndexStore.getState().removeIndexEntry(id);
    if (existed) {
      try {
        await idbDel(picmonicKey(id));
      } catch (err) {
        console.error("[engram] delete idb failed", err);
      }
    } else {
      // Index-only entries (never opened) — still purge IDB record if present.
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
      },
      notes: source.notes,
      canvas: source.canvas,
    };
    set((s) => ({ picmonics: { ...s.picmonics, [copy.id]: copy } }));
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(copy, null));
    return copy.id;
  },
  loadPicmonicById: async (id) => {
    if (get().picmonics[id]) {
      set({ currentPicmonicId: id });
      void maybeIndexBackdrop(get().picmonics[id]);
      return true;
    }
    try {
      const raw = await idbGet<Picmonic>(picmonicKey(id));
      if (!raw) return false;
      const data = normalizePicmonic(raw);
      set((s) => ({
        picmonics: { ...s.picmonics, [data.id]: data },
        currentPicmonicId: data.id,
      }));
      void maybeIndexBackdrop(data);
      return true;
    } catch (err) {
      console.error("[engram] load picmonic failed", err);
      return false;
    }
  },
  setSaveStatus: (status) => set({ saveStatus: status }),
  setLastSavedAt: (ts) => set({ lastSavedAt: ts }),
  hydratePicmonic: (picmonic) => {
    const normalized = normalizePicmonic(picmonic);
    set((s) => ({
      picmonics: { ...s.picmonics, [normalized.id]: normalized },
    }));
    void maybeIndexBackdrop(normalized);
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
