import type Konva from "konva";

export interface PngExportOptions {
  pixelRatio?: number;
}

export async function exportStageToPng(
  stage: Konva.Stage,
  opts: PngExportOptions = {},
): Promise<Blob> {
  const pixelRatio = opts.pixelRatio ?? 2;
  const dataUrl = stage.toDataURL({
    pixelRatio,
    mimeType: "image/png",
  });
  const res = await fetch(dataUrl);
  return await res.blob();
}
