import JSZip from "jszip";
import type { Picmonic } from "@/lib/types/picmonic";
import { BUNDLE_SCHEMA_VERSION } from "@/lib/constants";
import type { UserAsset } from "@/lib/user-assets";
import { slugifyName } from "./download";

export interface BundleAssetInput {
  asset: UserAsset;
  blob: Blob;
}

export interface BundleInput {
  picmonic: Picmonic;
  pngBlob: Blob | null;
  userAssets?: BundleAssetInput[];
}

export async function buildBundleZip(input: BundleInput): Promise<Blob> {
  const { picmonic, pngBlob, userAssets } = input;
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

  if (userAssets && userAssets.length > 0) {
    const assetsFolder = folder.folder("assets") ?? folder;
    assetsFolder.file(
      "manifest.json",
      JSON.stringify(
        {
          version: 1,
          assets: userAssets.map((a) => a.asset),
        },
        null,
        2,
      ),
    );
    for (const { asset, blob } of userAssets) {
      // Convert to ArrayBuffer — JSZip's node build can't ingest Blob.
      const buf = await blob.arrayBuffer();
      assetsFolder.file(`${asset.id}.${asset.ext}`, buf);
    }
  }

  return await zip.generateAsync({ type: "blob" });
}
