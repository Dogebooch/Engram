import type Konva from "konva";
import { STAGE_WIDTH } from "@/lib/constants";

const THUMB_WIDTH = 320;

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
    return stage.toDataURL({
      pixelRatio: THUMB_WIDTH / STAGE_WIDTH,
      mimeType: "image/jpeg",
      quality: 0.7,
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
