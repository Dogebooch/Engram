import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";

export interface FitBox {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const ZERO_BOX: FitBox = {
  width: 0,
  height: 0,
  scale: 0,
  offsetX: 0,
  offsetY: 0,
};

/** Letterbox the fixed 1920×1080 stage into a `cw`×`ch` container, centered. */
export function computeFitBox(cw: number, ch: number): FitBox {
  if (cw <= 0 || ch <= 0) return ZERO_BOX;
  const scale = Math.min(cw / STAGE_WIDTH, ch / STAGE_HEIGHT);
  const width = STAGE_WIDTH * scale;
  const height = STAGE_HEIGHT * scale;
  const offsetX = Math.round((cw - width) / 2);
  const offsetY = Math.round((ch - height) / 2);
  return { width, height, scale, offsetX, offsetY };
}
