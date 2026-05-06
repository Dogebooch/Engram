import type Konva from "konva";
import type { Picmonic } from "@/lib/types/picmonic";
import { buildAnkiCsv } from "./anki";
import {
  buildBundleZip,
  type BundleAssetInput,
  type BundleBackdropInput,
} from "./bundle";
import { downloadBlob, downloadText, slugifyName } from "./download";
import { exportStageToPng, rasterizePicmonicToPng } from "./png";
import { extForMime } from "@/lib/user-assets/refs";
import {
  assetIdFromSymbolRef,
  getBlob,
  getUserAssetsSnapshot,
  isUserSymbolRef,
} from "@/lib/user-assets";

export async function exportPng(
  stage: Konva.Stage,
  picmonic: Picmonic,
): Promise<void> {
  const blob = await exportStageToPng(stage);
  downloadBlob(blob, `${slugifyName(picmonic.meta.name)}.png`);
}

export async function exportPngFromPicmonic(picmonic: Picmonic): Promise<void> {
  const blob = await rasterizePicmonicToPng(picmonic);
  downloadBlob(blob, `${slugifyName(picmonic.meta.name)}.png`);
}

export function exportMarkdown(picmonic: Picmonic): void {
  downloadText(
    picmonic.notes ?? "",
    `${slugifyName(picmonic.meta.name)}.md`,
    "text/markdown;charset=utf-8",
  );
}

export function exportAnkiCsv(picmonic: Picmonic): void {
  const slug = slugifyName(picmonic.meta.name);
  const csv = buildAnkiCsv({
    picmonicName: picmonic.meta.name,
    notes: picmonic.notes ?? "",
    imagePath: `${slug}.png`,
  });
  downloadText(csv, `${slug}.csv`, "text/csv;charset=utf-8");
}

export async function exportBundle(
  stage: Konva.Stage | null,
  picmonic: Picmonic,
): Promise<void> {
  let pngBlob: Blob | null = null;
  if (stage) {
    try {
      pngBlob = await exportStageToPng(stage);
    } catch (err) {
      console.warn("[engram] bundle png skipped", err);
    }
  }
  const userAssets = await collectReferencedUserAssets(picmonic);
  const backdrops = await collectBackdropAssets(picmonic);
  const zip = await buildBundleZip({
    picmonic,
    pngBlob,
    userAssets,
    backdrops,
  });
  downloadBlob(zip, `${slugifyName(picmonic.meta.name)}.zip`);
}

async function collectReferencedUserAssets(
  picmonic: Picmonic,
): Promise<BundleAssetInput[]> {
  const referencedIds = new Set<string>();
  for (const layer of picmonic.canvas.symbols) {
    if (!isUserSymbolRef(layer.ref)) continue;
    const id = assetIdFromSymbolRef(layer.ref);
    if (id) referencedIds.add(id);
  }
  // Bundle the backdrop's asset metadata too, if it's been registered.
  // The blob itself still travels via the `backdrops` channel.
  const backdropId = picmonic.canvas.backdrop?.uploadedBlobId ?? null;
  if (backdropId) referencedIds.add(backdropId);
  if (referencedIds.size === 0) return [];
  const snapshot = getUserAssetsSnapshot();
  const byId = new Map(snapshot.map((a) => [a.id, a]));
  const out: BundleAssetInput[] = [];
  for (const id of referencedIds) {
    const asset = byId.get(id);
    if (!asset) {
      // Backdrop blobs that predate background indexing won't have metadata
      // — that's fine; the legacy `backdrops` section still carries the blob.
      if (id !== backdropId) {
        console.warn(`[engram] export: missing user asset metadata for ${id}`);
      }
      continue;
    }
    const blob = await getBlob(id);
    if (!blob) {
      console.warn(`[engram] export: missing blob for ${id}`);
      continue;
    }
    out.push({ asset, blob });
  }
  return out;
}

async function collectBackdropAssets(
  picmonic: Picmonic,
): Promise<BundleBackdropInput[]> {
  const id = picmonic.canvas.backdrop?.uploadedBlobId;
  if (!id) return [];
  const blob = await getBlob(id);
  if (!blob) {
    console.warn(`[engram] export: missing backdrop blob for ${id}`);
    return [];
  }
  // If the backdrop has been registered as a `kind: "background"` asset,
  // its name/tags travel inside `userAssets`. The `backdrops` channel is
  // retained for backwards compatibility with older importers and as a
  // fallback when the asset metadata is missing.
  return [
    {
      id,
      ext: extForMime(blob.type),
      mimeType: blob.type,
      blob,
    },
  ];
}
