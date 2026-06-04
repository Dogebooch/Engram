import type { PicmonicIndexEntry } from "@/lib/types/index-entry";
import type {
  BundleSourceVideo,
  MedicineVideo,
  SourceVideoProvenance,
} from "@/lib/types/source-video";

export function normalizeVideoTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/^\s*\d{3,4}x\d{3,4}\s+/i, "")
    .replace(/\bmnemonic\s+for\s+usmle\b/gi, "")
    .replace(/\bfor\s+usmle\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeVideoPath(value: string | undefined): string {
  return (value ?? "").replace(/\\/g, "/").toLowerCase();
}

export function deriveBundleSourceVideo(
  bundleSource: BundleSourceVideo | null | undefined,
  fallbackTitle: string,
  videos: readonly MedicineVideo[],
): SourceVideoProvenance | null {
  const importedAt = Date.now();
  const provider = bundleSource?.provider === "mvs" ? "mvs" : "mvs";
  const byId =
    typeof bundleSource?.id === "number"
      ? videos.find((v) => v.id === bundleSource.id)
      : undefined;
  if (byId) {
    return {
      provider,
      id: byId.id,
      title: byId.title,
      path: byId.path,
      source: byId.source,
      course: byId.course,
      importedAt,
      confidence: "matched",
    };
  }

  const sourcePath = normalizeVideoPath(bundleSource?.path);
  const byPath = sourcePath
    ? videos.find((v) => normalizeVideoPath(v.path) === sourcePath)
    : undefined;
  if (byPath) {
    return {
      provider,
      id: byPath.id,
      title: byPath.title,
      path: byPath.path,
      source: byPath.source,
      course: byPath.course,
      importedAt,
      confidence: "matched",
    };
  }

  const title = bundleSource?.title || fallbackTitle;
  const normalizedTitle = normalizeVideoTitle(title);
  const titleMatches = normalizedTitle
    ? videos.filter((v) => normalizeVideoTitle(v.title) === normalizedTitle)
    : [];
  if (titleMatches.length === 1) {
    const v = titleMatches[0];
    return {
      provider,
      id: v.id,
      title: v.title,
      path: v.path,
      source: v.source,
      course: v.course,
      importedAt,
      confidence: "matched",
    };
  }
  if (titleMatches.length > 1) {
    return {
      provider,
      title,
      importedAt,
      confidence: "probable",
    };
  }
  if (bundleSource || normalizedTitle) {
    return {
      provider,
      id: bundleSource?.id,
      title,
      path: bundleSource?.path,
      source: bundleSource?.source,
      course: bundleSource?.course,
      importedAt,
      confidence: bundleSource ? "probable" : "unmatched",
    };
  }
  return null;
}

export function findExistingImportedSource(
  index: readonly PicmonicIndexEntry[],
  sourceVideo: SourceVideoProvenance | null | undefined,
): PicmonicIndexEntry | null {
  if (!sourceVideo || sourceVideo.confidence !== "matched") return null;
  return (
    index.find((entry) => {
      const existing = entry.sourceVideo;
      if (!existing || existing.provider !== sourceVideo.provider) return false;
      if (
        typeof existing.id === "number" &&
        typeof sourceVideo.id === "number" &&
        existing.id === sourceVideo.id
      ) {
        return true;
      }
      if (
        existing.path &&
        sourceVideo.path &&
        normalizeVideoPath(existing.path) === normalizeVideoPath(sourceVideo.path)
      ) {
        return true;
      }
      return false;
    }) ?? null
  );
}
