export interface PicmonicIndexEntry {
  id: string;
  name: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  thumbDataUrl: string | null;
  symbolCount: number;
  factCount: number;
}

export type PicmonicIndex = PicmonicIndexEntry[];
