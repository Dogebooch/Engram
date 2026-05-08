import type Konva from "konva";

const THUMB_WIDTH = 960;

export function captureThumbnail(stage: Konva.Stage | null): string | null {
  if (!stage) return null;
  // Hide editing chrome (dot grid, transformer, group outlines) so the
  // thumbnail captures only the composition. Same convention as the PNG
  // export — see [png.ts].
  const hidden: Konva.Node[] = [];
  for (const node of stage.find(".export-chrome")) {
    if (node.visible()) {
      node.visible(false);
      hidden.push(node);
    }
  }
  if (hidden.length > 0) stage.draw();
  try {
    // Konva's toDataURL outputs `pixelRatio × stage.width()` pixels wide.
    // The stage is sized to the viewport (not the logical 1920px canvas),
    // so derive pixelRatio from the actual stage width to land on a
    // consistent THUMB_WIDTH-wide raster regardless of zoom level.
    const stageW = stage.width();
    if (!stageW) return null;
    return stage.toDataURL({
      pixelRatio: THUMB_WIDTH / stageW,
      mimeType: "image/jpeg",
      quality: 0.85,
    });
  } catch (err) {
    console.warn("[engram] thumbnail capture failed", err);
    return null;
  } finally {
    if (hidden.length > 0) {
      for (const node of hidden) node.visible(true);
      stage.draw();
    }
  }
}
