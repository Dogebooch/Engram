export type SourceVideoProvider = "mvs";
export type SourceVideoConfidence = "matched" | "probable" | "unmatched";

export interface SourceVideoProvenance {
  provider: SourceVideoProvider;
  id?: number;
  title: string;
  path?: string;
  source?: string;
  course?: string;
  importedAt: number;
  confidence: SourceVideoConfidence;
}

export interface MedicineVideo {
  id: number;
  source: string;
  course: string;
  title: string;
  path: string;
  durationSeconds: number | null;
  mtime: number;
}

export interface BundleSourceVideo {
  provider?: SourceVideoProvider;
  id?: number;
  title?: string;
  path?: string;
  source?: string;
  course?: string;
}
