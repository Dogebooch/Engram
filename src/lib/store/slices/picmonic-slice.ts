import type { StateCreator } from "zustand";
import { newId } from "@/lib/id";
import { emptyCanvas } from "@/lib/types/canvas";
import type { CanvasState } from "@/lib/types/canvas";
import type {
  NotesDoc,
  Picmonic,
  SaveStatus,
} from "@/lib/types/picmonic";
import type { RootState } from "../types";

export interface PicmonicSlice {
  picmonics: Record<string, Picmonic>;
  currentPicmonicId: string | null;
  saveStatus: SaveStatus;
  createPicmonic: (initialName?: string) => string;
  setCurrentPicmonic: (id: string | null) => void;
  renamePicmonic: (id: string, name: string) => void;
  deletePicmonic: (id: string) => void;
  setSaveStatus: (status: SaveStatus) => void;
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

export const createPicmonicSlice: StateCreator<RootState, [], [], PicmonicSlice> = (set) => ({
  picmonics: {},
  currentPicmonicId: null,
  saveStatus: "idle",
  createPicmonic: (initialName = "Untitled Picmonic") => {
    const p = makePicmonic(initialName);
    set((s) => ({
      picmonics: { ...s.picmonics, [p.id]: p },
      currentPicmonicId: p.id,
      ui: { ...s.ui, rightCollapsed: true },
    }));
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
  deletePicmonic: (id) =>
    set((s) => {
      if (!s.picmonics[id]) return s;
      const { [id]: _removed, ...rest } = s.picmonics;
      void _removed;
      return {
        picmonics: rest,
        currentPicmonicId: s.currentPicmonicId === id ? null : s.currentPicmonicId,
      };
    }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  hydratePicmonic: (picmonic) =>
    set((s) => ({
      picmonics: { ...s.picmonics, [picmonic.id]: picmonic },
    })),
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
