import type { CanvasState } from "./canvas";
import type { SourceVideoProvenance } from "./source-video";

export type NotesDoc = string;

export interface PicmonicMeta {
  name: string;
  tags: string[];
  folderId?: string | null;
  sourceVideo?: SourceVideoProvenance | null;
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
