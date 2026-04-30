import JSZip from "jszip";
import type { Picmonic } from "@/lib/types/picmonic";
import { CANVAS_SCHEMA_VERSION } from "@/lib/constants";
import { slugifyName } from "./download";

export interface BundleInput {
  picmonic: Picmonic;
  pngBlob: Blob | null;
}

export async function buildBundleZip(input: BundleInput): Promise<Blob> {
  const { picmonic, pngBlob } = input;
  const zip = new JSZip();
  const slug = slugifyName(picmonic.meta.name);
  const folder = zip.folder(slug) ?? zip;

  folder.file("notes.md", picmonic.notes ?? "");
  folder.file("canvas.json", JSON.stringify(picmonic.canvas, null, 2));
  folder.file(
    "meta.json",
    JSON.stringify(
      {
        schemaVersion: CANVAS_SCHEMA_VERSION,
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

  return await zip.generateAsync({ type: "blob" });
}
