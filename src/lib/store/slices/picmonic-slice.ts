import type { StateCreator } from "zustand";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { newId } from "@/lib/id";
import { emptyCanvas, normalizeCanvas } from "@/lib/types/canvas";
import type { CanvasState } from "@/lib/types/canvas";
import type {
  NotesDoc,
  Picmonic,
  PicmonicMeta,
  SaveStatus,
} from "@/lib/types/picmonic";
import { entryFromPicmonic, useIndexStore } from "../index-store";
import type { RootState } from "../types";

function normalizePicmonic(p: Picmonic): Picmonic {
  const meta: PicmonicMeta = {
    ...p.meta,
    tags: Array.isArray(p.meta.tags) ? p.meta.tags : [],
    folderId: p.meta.folderId ?? null,
    sourceVideo: p.meta.sourceVideo ?? null,
  };
  const canvas = normalizeCanvas(p.canvas);
  return canvas === p.canvas && meta === p.meta ? p : { ...p, meta, canvas };
}

export interface PicmonicSlice {
  picmonics: Record<string, Picmonic>;
  currentPicmonicId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  createPicmonic: (initialName?: string, folderId?: string | null) => string;
  setCurrentPicmonic: (id: string | null) => void;
  renamePicmonic: (id: string, name: string) => void;
  setPicmonicFolder: (id: string, folderId: string | null) => Promise<boolean>;
  deletePicmonic: (id: string) => Promise<void>;
  duplicatePicmonic: (id: string) => Promise<string | null>;
  loadPicmonicById: (id: string) => Promise<boolean>;
  setSaveStatus: (status: SaveStatus) => void;
  setLastSavedAt: (ts: number | null) => void;
  hydratePicmonic: (picmonic: Picmonic) => void;
  setNotes: (id: string, notes: NotesDoc) => void;
  setCanvas: (id: string, canvas: CanvasState) => void;
}

function makePicmonic(name: string, folderId: string | null = null): Picmonic {
  const now = Date.now();
  return {
    id: newId(),
    meta: { name, tags: [], folderId, sourceVideo: null, createdAt: now, updatedAt: now },
    notes: "",
    canvas: emptyCanvas(),
  };
}

export const createPicmonicSlice: StateCreator<RootState, [], [], PicmonicSlice> = (set, get) => ({
  picmonics: {},
  currentPicmonicId: null,
  saveStatus: "idle",
  lastSavedAt: null,
  createPicmonic: (initialName = "Untitled Picmonic", folderId = null) => {
    const p = makePicmonic(initialName, folderId);
    set((s) => ({
      picmonics: { ...s.picmonics, [p.id]: p },
      currentPicmonicId: p.id,
      // Show the notes panel on a fresh scene so its getting-started guidance
      // is visible, and flag the new id so the title enters rename-on-create.
      ui: { ...s.ui, rightCollapsed: false, justCreatedPicmonicId: p.id },
    }));
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(p, null));
    return p.id;
  },
  setCurrentPicmonic: (id) => set({ currentPicmonicId: id }),
  renamePicmonic: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void updatePicmonicMeta(get, set, id, (meta) => ({
      ...meta,
      name: trimmed,
      updatedAt: Date.now(),
    }));
  },
  setPicmonicFolder: async (id, folderId) => {
    return await updatePicmonicMeta(get, set, id, (meta) => ({
      ...meta,
      folderId,
      updatedAt: Date.now(),
    }));
  },
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
        folderId: source.meta.folderId ?? null,
        sourceVideo: null,
        createdAt: now,
        updatedAt: now,
      },
      notes: source.notes,
      canvas: source.canvas,
    };
    set((s) => ({ picmonics: { ...s.picmonics, [copy.id]: copy } }));
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(copy, null));
    try {
      await idbSet(picmonicKey(copy.id), copy);
    } catch (err) {
      console.error("[engram] duplicate idb failed", err);
    }
    return copy.id;
  },
  loadPicmonicById: async (id) => {
    if (get().picmonics[id]) {
      set({ currentPicmonicId: id });
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

async function updatePicmonicMeta(
  get: () => RootState,
  set: (
    partial:
      | RootState
      | Partial<RootState>
      | ((state: RootState) => RootState | Partial<RootState>),
    replace?: false,
  ) => void,
  id: string,
  update: (meta: PicmonicMeta) => PicmonicMeta,
): Promise<boolean> {
  let source: Picmonic | undefined = get().picmonics[id];
  if (!source) {
    try {
      const raw = await idbGet<Picmonic>(picmonicKey(id));
      if (raw) source = normalizePicmonic(raw);
    } catch {
      source = undefined;
    }
  }
  if (!source) return false;

  const normalized = normalizePicmonic(source);
  const next: Picmonic = {
    ...normalized,
    meta: update(normalized.meta),
  };

  set((s) => ({
    picmonics: s.picmonics[id]
      ? { ...s.picmonics, [id]: next }
      : s.picmonics,
  }));
  useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(next, null));
  try {
    await idbSet(picmonicKey(id), next);
  } catch (err) {
    console.error("[engram] metadata idb update failed", err);
    return false;
  }
  return true;
}
