import { USER_SYMBOL_PREFIX } from "@/lib/constants";

export function userAssetSymbolId(assetId: string): string {
  return `${USER_SYMBOL_PREFIX}${assetId}`;
}

export function isUserSymbolRef(ref: string): boolean {
  return ref.startsWith(USER_SYMBOL_PREFIX);
}

export function assetIdFromSymbolRef(ref: string): string | null {
  if (!isUserSymbolRef(ref)) return null;
  return ref.slice(USER_SYMBOL_PREFIX.length);
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

export function extForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? "bin";
}

export function deriveDisplayName(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const cleaned = stem.replace(/[_-]+/g, " ").trim();
  return cleaned || "Uploaded image";
}

export function deriveTags(filename: string): string[] {
  const name = deriveDisplayName(filename);
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}
