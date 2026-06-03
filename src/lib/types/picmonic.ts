import type { CanvasState } from "./canvas";

export type NotesDoc = string;

export type PicmonicSource = "imported" | "generated";

export interface PicmonicMeta {
  name: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  source?: PicmonicSource;
  sourceRef?: string;
}

export interface Picmonic {
  id: string;
  meta: PicmonicMeta;
  notes: NotesDoc;
  canvas: CanvasState;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function normalizeMeta(meta: PicmonicMeta): PicmonicMeta {
  if (meta.source === "imported" || meta.source === "generated") return meta;
  return { ...meta, source: "generated" };
}
