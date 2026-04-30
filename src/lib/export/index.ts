import type Konva from "konva";
import type { Picmonic } from "@/lib/types/picmonic";
import { buildAnkiCsv } from "./anki";
import { buildBundleZip } from "./bundle";
import { downloadBlob, downloadText, slugifyName } from "./download";
import { exportStageToPng } from "./png";

export async function exportPng(
  stage: Konva.Stage,
  picmonic: Picmonic,
): Promise<void> {
  const blob = await exportStageToPng(stage);
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
  const zip = await buildBundleZip({ picmonic, pngBlob });
  downloadBlob(zip, `${slugifyName(picmonic.meta.name)}.zip`);
}
