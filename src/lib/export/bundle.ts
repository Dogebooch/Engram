import JSZip from "jszip";
import type { Picmonic } from "@/lib/types/picmonic";
import { BUNDLE_SCHEMA_VERSION } from "@/lib/constants";
import type { UserAsset } from "@/lib/user-assets";
import { slugifyName } from "./download";

export interface BundleAssetInput {
  asset: UserAsset;
  blob: Blob;
}

/**
 * Backdrop blobs are tracked separately from `userAssets` because they are
 * not symbols — they have no library entry and never appear as `user:<id>`
 * refs. The bundle records just enough metadata (id + ext + mime) to round
 * trip the file.
 */
export interface BundleBackdropInput {
  id: string;
  ext: string;
  mimeType: string;
  blob: Blob;
}

export interface BundleInput {
  picmonic: Picmonic;
  pngBlob: Blob | null;
  userAssets?: BundleAssetInput[];
  backdrops?: BundleBackdropInput[];
}

export async function buildBundleZip(input: BundleInput): Promise<Blob> {
  const { picmonic, pngBlob, userAssets, backdrops } = input;
  const zip = new JSZip();
  const slug = slugifyName(picmonic.meta.name);
  const folder = zip.folder(slug) ?? zip;

  folder.file("notes.md", picmonic.notes ?? "");
  folder.file("canvas.json", JSON.stringify(picmonic.canvas, null, 2));
  folder.file(
    "meta.json",
    JSON.stringify(
      {
        schemaVersion: BUNDLE_SCHEMA_VERSION,
        id: picmonic.id,
        name: picmonic.meta.name,
        tags: picmonic.meta.tags ?? [],
        createdAt: picmonic.meta.createdAt,
        updatedAt: picmonic.meta.updatedAt,
        exportedAt: Date.now(),
      },
      null,
      2,
    ),
  );
  if (pngBlob) {
    folder.file("scene.png", pngBlob);
  }

  const hasUserAssets = userAssets && userAssets.length > 0;
  const hasBackdrops = backdrops && backdrops.length > 0;
  if (hasUserAssets || hasBackdrops) {
    const assetsFolder = folder.folder("assets") ?? folder;
    assetsFolder.file(
      "manifest.json",
      JSON.stringify(
        {
          version: 2,
          assets: hasUserAssets ? userAssets.map((a) => a.asset) : [],
          backdrops: hasBackdrops
            ? backdrops.map((b) => ({
                id: b.id,
                ext: b.ext,
                mimeType: b.mimeType,
              }))
            : [],
        },
        null,
        2,
      ),
    );
    if (hasUserAssets) {
      for (const { asset, blob } of userAssets) {
        // Convert to ArrayBuffer — JSZip's node build can't ingest Blob.
        const buf = await blob.arrayBuffer();
        assetsFolder.file(`${asset.id}.${asset.ext}`, buf);
      }
    }
    if (hasBackdrops) {
      for (const { id, ext, blob } of backdrops) {
        const buf = await blob.arrayBuffer();
        assetsFolder.file(`${id}.${ext}`, buf);
      }
    }
  }

  return await zip.generateAsync({ type: "blob" });
}
