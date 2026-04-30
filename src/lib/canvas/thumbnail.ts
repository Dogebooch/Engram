import type Konva from "konva";
import { STAGE_WIDTH } from "@/lib/constants";

const THUMB_WIDTH = 320;

export function captureThumbnail(stage: Konva.Stage | null): string | null {
  if (!stage) return null;
  try {
    return stage.toDataURL({
      pixelRatio: THUMB_WIDTH / STAGE_WIDTH,
      mimeType: "image/jpeg",
      quality: 0.7,
    });
  } catch (err) {
    console.warn("[engram] thumbnail capture failed", err);
    return null;
  }
}
