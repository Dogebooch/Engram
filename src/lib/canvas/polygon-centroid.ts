import type { PolygonPoint } from "@/lib/types/canvas";

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Centroid of a closed polygon by signed-area formula. Robust to non-convex
 * shapes (the lasso tool produces these) — the simple "mean of vertices"
 * shortcut would skew toward dense vertex clusters along a long curved edge.
 *
 * Falls back to the bounding-box center when the polygon area is degenerate
 * (collinear points, total area near zero) so callers never see NaN.
 */
export function polygonCentroid(points: readonly PolygonPoint[]): PolygonPoint {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { x: points[0].x, y: points[0].y };
  if (n === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    twiceArea += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-6) {
    return polygonBBoxCenter(points);
  }
  const factor = 1 / (3 * twiceArea);
  return { x: cx * factor, y: cy * factor };
}

export function polygonBBox(points: readonly PolygonPoint[]): BBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = minX;
  let maxY = minY;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function polygonBBoxCenter(points: readonly PolygonPoint[]): PolygonPoint {
  const b = polygonBBox(points);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
