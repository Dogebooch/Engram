import JSZip from "jszip";
import {
  SUPPORTED_BUNDLE_SCHEMA_VERSIONS,
  CANVAS_SCHEMA_VERSION,
} from "@/lib/constants";
import { newId } from "@/lib/id";
import { parseNotes } from "@/lib/notes/parse";
import { emptyCanvas, type CanvasState } from "@/lib/types/canvas";
import type { Picmonic, PicmonicMeta } from "@/lib/types/picmonic";
import {
  putBlob,
  registerImportedUserAssets,
  type UserAsset,
} from "./import-user-assets";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BundleImportReason =
  | "invalid-zip"
  | "missing-file"
  | "invalid-json"
  | "schema-mismatch"
  | "invalid-uuid";

export class BundleImportError extends Error {
  readonly reason: BundleImportReason;

  constructor(reason: BundleImportReason, message?: string) {
    super(message ?? defaultMessage(reason));
    this.name = "BundleImportError";
    this.reason = reason;
  }
}

function defaultMessage(reason: BundleImportReason): string {
  switch (reason) {
    case "invalid-zip":
      return "Could not read .zip — file may be corrupted.";
    case "missing-file":
      return "Bundle is missing notes.md or canvas.json.";
    case "invalid-json":
      return "Bundle contains malformed JSON.";
    case "schema-mismatch":
      return "Bundle was made with a different schema version.";
    case "invalid-uuid":
      return "Bundle contains an invalid UUID.";
  }
}

interface BundleMeta {
  schemaVersion?: number;
  id?: string;
  name?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
  exportedAt?: number;
}

interface AssetManifest {
  version?: number;
  assets?: UserAsset[];
}

/**
 * Parse an export bundle (.zip) and return a fresh `Picmonic` ready to
 * register via `hydratePicmonic` + `useIndexStore.upsertIndexEntry`.
 *
 * Behavior:
 * - `id` is regenerated to avoid collisions with existing Picmonics. Symbol
 *   UUIDs and group IDs are preserved (no cross-bundle collision risk).
 * - `createdAt` is preserved (authorship date); `updatedAt` is set to now.
 * - `factHotspots` are reconciled against re-parsed notes — orphans (whose
 *   factId no longer exists) are dropped with a warning.
 * - Soft cross-ref check: `{sym:UUID}` references in notes that don't exist in
 *   `canvas.symbols` produce a console warning, not an error.
 * - If the bundle includes `assets/manifest.json` and `assets/<id>.<ext>`
 *   files, each user asset is restored to IDB (skipped if id already
 *   present) and registered in the in-memory symbol cache so the imported
 *   canvas resolves on first render.
 *
 * Throws `BundleImportError` for fatal cases (corrupt zip, missing required
 * files, schema mismatch, invalid UUIDs).
 */
export async function importBundle(
  file: File | Blob | ArrayBuffer | Uint8Array,
): Promise<Picmonic> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new BundleImportError("invalid-zip", (err as Error)?.message);
  }

  const filesByBasename = collectFiles(zip);
  const notesEntry = filesByBasename.get("notes.md");
  const canvasEntry = filesByBasename.get("canvas.json");
  const metaEntry = filesByBasename.get("meta.json");

  if (!notesEntry || !canvasEntry || !metaEntry) {
    throw new BundleImportError("missing-file");
  }

  const [notesText, canvasText, metaText] = await Promise.all([
    notesEntry.async("string"),
    canvasEntry.async("string"),
    metaEntry.async("string"),
  ]);

  const meta = parseJson<BundleMeta>(metaText, "meta.json");
  const canvasRaw = parseJson<CanvasState>(canvasText, "canvas.json");

  const declaredSchema = canvasRaw.schemaVersion ?? meta.schemaVersion;
  if (
    typeof declaredSchema === "number" &&
    !SUPPORTED_BUNDLE_SCHEMA_VERSIONS.includes(declaredSchema as 1 | 2)
  ) {
    throw new BundleImportError(
      "schema-mismatch",
      `Bundle schema v${declaredSchema} not supported (need v${SUPPORTED_BUNDLE_SCHEMA_VERSIONS.join(" or v")}).`,
    );
  }

  validateCanvasUuids(canvasRaw);

  // Restore user assets first so canvas refs (e.g. "user:<uuid>") resolve.
  const manifestEntry = findManifestEntry(zip);
  if (manifestEntry) {
    const manifestText = await manifestEntry.async("string");
    const manifest = parseJson<AssetManifest>(manifestText, "assets/manifest.json");
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    const restored: { asset: UserAsset; blob: Blob }[] = [];
    for (const asset of assets) {
      if (!asset || typeof asset.id !== "string") continue;
      const blobEntry = findAssetBlob(zip, asset.id, asset.ext);
      if (!blobEntry) {
        console.warn(
          `[engram] importBundle: asset blob missing for ${asset.id}; skipping`,
        );
        continue;
      }
      const blob = await blobEntry.async("blob");
      const typed =
        asset.mimeType && blob.type !== asset.mimeType
          ? new Blob([blob], { type: asset.mimeType })
          : blob;
      restored.push({ asset, blob: typed });
    }
    if (restored.length > 0) {
      await registerImportedUserAssets(restored);
    }
  }

  const reconciledCanvas = reconcileCanvas(canvasRaw, notesText);

  warnOnOrphanSymbolRefs(notesText, reconciledCanvas.symbols.map((s) => s.id));

  const now = Date.now();
  const importedMeta: PicmonicMeta = {
    name: typeof meta.name === "string" && meta.name.trim().length > 0
      ? meta.name.trim()
      : "Imported Picmonic",
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === "string") : [],
    createdAt: typeof meta.createdAt === "number" ? meta.createdAt : now,
    updatedAt: now,
  };

  return {
    id: newId(),
    meta: importedMeta,
    notes: notesText,
    canvas: reconciledCanvas,
  };
}

void putBlob; // re-exported for tests

/** Map basename → JSZipFile so we tolerate top-level slug folders or flat zips. */
function collectFiles(zip: JSZip): Map<string, JSZip.JSZipObject> {
  const map = new Map<string, JSZip.JSZipObject>();
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const basename = path.split("/").pop() ?? path;
    if (!map.has(basename)) map.set(basename, entry);
  });
  return map;
}

function findManifestEntry(zip: JSZip): JSZip.JSZipObject | undefined {
  let found: JSZip.JSZipObject | undefined;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (found) return;
    const norm = path.replace(/\\/g, "/");
    if (norm.endsWith("/assets/manifest.json") || norm === "assets/manifest.json") {
      found = entry;
    }
  });
  return found;
}

function findAssetBlob(
  zip: JSZip,
  id: string,
  ext: string,
): JSZip.JSZipObject | undefined {
  let found: JSZip.JSZipObject | undefined;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (found) return;
    const norm = path.replace(/\\/g, "/");
    if (
      norm.endsWith(`/assets/${id}.${ext}`) ||
      norm === `assets/${id}.${ext}`
    ) {
      found = entry;
    }
  });
  return found;
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new BundleImportError(
      "invalid-json",
      `${label}: ${(err as Error)?.message ?? "parse error"}`,
    );
  }
}

function validateCanvasUuids(canvas: CanvasState): void {
  if (!Array.isArray(canvas.symbols)) {
    throw new BundleImportError("invalid-json", "canvas.symbols missing");
  }
  for (const sy of canvas.symbols) {
    if (typeof sy.id !== "string" || !UUID_RE.test(sy.id)) {
      throw new BundleImportError("invalid-uuid", `bad symbol id: ${String(sy.id)}`);
    }
  }
  for (const g of canvas.groups ?? []) {
    if (typeof g.id !== "string" || !UUID_RE.test(g.id)) {
      throw new BundleImportError("invalid-uuid", `bad group id: ${String(g.id)}`);
    }
  }
}

/** Drop hotspots whose factId no longer resolves in the re-parsed notes. */
function reconcileCanvas(canvas: CanvasState, notes: string): CanvasState {
  const base: CanvasState = {
    ...emptyCanvas(),
    ...canvas,
    symbols: Array.isArray(canvas.symbols) ? canvas.symbols : [],
    groups: Array.isArray(canvas.groups) ? canvas.groups : [],
    factHotspots: canvas.factHotspots ?? {},
    schemaVersion: CANVAS_SCHEMA_VERSION,
  };

  const parsed = parseNotes(notes);
  const validFactIds = new Set(parsed.factsById.keys());
  const before = Object.keys(base.factHotspots);
  const reconciled: CanvasState["factHotspots"] = {};
  let dropped = 0;
  for (const factId of before) {
    if (validFactIds.has(factId)) {
      reconciled[factId] = base.factHotspots[factId];
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0) {
    console.warn(
      `[engram] importBundle: dropped ${dropped} orphan factHotspot entr${dropped === 1 ? "y" : "ies"} (factIds not found in re-parsed notes)`,
    );
  }

  return { ...base, factHotspots: reconciled };
}

function warnOnOrphanSymbolRefs(notes: string, knownSymbolIds: readonly string[]): void {
  const known = new Set(knownSymbolIds.map((id) => id.toLowerCase()));
  const seen = new Set<string>();
  const re = /\{sym:([0-9a-f-]+)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(notes)) !== null) {
    const id = m[1].toLowerCase();
    if (!UUID_RE.test(id)) continue;
    if (!known.has(id) && !seen.has(id)) {
      seen.add(id);
    }
  }
  if (seen.size > 0) {
    console.warn(
      `[engram] importBundle: ${seen.size} {sym:UUID} reference(s) in notes don't match any symbol in canvas.symbols`,
    );
  }
}
