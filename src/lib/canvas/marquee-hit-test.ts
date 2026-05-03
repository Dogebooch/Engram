import type { SymbolLayer } from "@/lib/types/canvas";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize a possibly-negative-size rect (dragged up-left) into a positive
 * width/height rect with its origin at the top-left.
 */
export function normalizeRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Rect {
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  const width = Math.abs(bx - ax);
  const height = Math.abs(by - ay);
  return { x, y, width, height };
}

/**
 * Axis-aligned envelope around a rotated symbol.
 *
 * Konva rotates about `(layer.x, layer.y)` (the unrotated top-left) — see
 * `centroid.ts`. We project all four corners and take the min/max envelope.
 */
export function symbolAabb(layer: SymbolLayer): Rect {
  const theta = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const w = layer.width;
  const h = layer.height;
  const corners: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of corners) {
    const wx = layer.x + lx * cos - ly * sin;
    const wy = layer.y + lx * sin + ly * cos;
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  if (a.width <= 0 || a.height <= 0) return false;
  if (b.width <= 0 || b.height <= 0) return false;
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Return the ids of every symbol whose rotation-aware bounding box intersects
 * `marquee`. Touch-to-select semantics (matches Figma / Excalidraw).
 */
export function marqueeHitTest(
  marquee: Rect,
  layers: readonly SymbolLayer[],
): string[] {
  if (marquee.width <= 0 || marquee.height <= 0) return [];
  const out: string[] = [];
  for (const layer of layers) {
    if (rectsIntersect(marquee, symbolAabb(layer))) out.push(layer.id);
  }
  return out;
}
