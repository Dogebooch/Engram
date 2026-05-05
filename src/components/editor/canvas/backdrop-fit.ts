import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";

export interface FitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute "object-fit: cover" placement of an image inside a stage.
 * Returned rect is in stage coordinates: it fills the stage on at least one
 * axis and centers any overflow on the other axis. Pure.
 */
export function coverFit(
  imgWidth: number,
  imgHeight: number,
  stageWidth: number = STAGE_WIDTH,
  stageHeight: number = STAGE_HEIGHT,
): FitRect {
  if (imgWidth <= 0 || imgHeight <= 0) {
    return { x: 0, y: 0, width: stageWidth, height: stageHeight };
  }
  const scale = Math.max(stageWidth / imgWidth, stageHeight / imgHeight);
  const width = imgWidth * scale;
  const height = imgHeight * scale;
  return {
    x: (stageWidth - width) / 2,
    y: (stageHeight - height) / 2,
    width,
    height,
  };
}
