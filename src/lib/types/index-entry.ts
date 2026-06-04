import type { SourceVideoProvenance } from "./source-video";

export interface PicmonicIndexEntry {
  id: string;
  name: string;
  tags: string[];
  folderId?: string | null;
  sourceVideo?: SourceVideoProvenance | null;
  createdAt: number;
  updatedAt: number;
  thumbDataUrl: string | null;
  symbolCount: number;
  factCount: number;
}

export type PicmonicIndex = PicmonicIndexEntry[];
