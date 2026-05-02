import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
} from "@/lib/constants";

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function clampToStage(
  x: number,
  y: number,
  size: number = SYMBOL_DEFAULT_SIZE,
): { x: number; y: number } {
  return {
    x: clamp(x, 0, STAGE_WIDTH - size),
    y: clamp(y, 0, STAGE_HEIGHT - size),
  };
}
