import type { CanvasState } from "./canvas";

export type NotesDoc = string;

export interface PicmonicMeta {
  name: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Picmonic {
  id: string;
  meta: PicmonicMeta;
  notes: NotesDoc;
  canvas: CanvasState;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";
