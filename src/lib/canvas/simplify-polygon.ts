import type { PolygonPoint } from "@/lib/types/canvas";
import { polygonBBox } from "./polygon-centroid";

/**
 * Default Ramer–Douglas–Peucker tolerance, in stage-space pixels. Tuned for
 * a 1920×1080 stage with the freehand lasso at typical cursor speeds: 2px is
 * tight enough to follow real curvature without leaving the visible cursor
 * trail jagged.
 */
export const DEFAULT_LASSO_EPSILON = 2;

/** Minimum bounding-box area (px²) required for a finalized lasso polygon. */
export const MIN_LASSO_BBOX_AREA = 100;

/** Minimum vertex count required for a finalized lasso polygon. */
export const MIN_LASSO_VERTICES = 3;

/**
 * Ramer–Douglas–Peucker simplification of a polyline. The freehand lasso
 * emits a point per pointermove (~tens of points per second), so without
 * simplification we'd persist hundreds of points per region — needlessly
 * expensive to render and painful to vertex-edit. Epsilon ~2px keeps the
 * shape visually identical while collapsing dense straight runs.
 */
export function simplifyPolyline(
  points: readonly PolygonPoint[],
  epsilon: number = DEFAULT_LASSO_EPSILON,
): PolygonPoint[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  rdp(points, 0, points.length - 1, epsilon, keep);
  const out: PolygonPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push({ x: points[i].x, y: points[i].y });
  }
  return out;
}

function rdp(
  points: readonly PolygonPoint[],
  from: number,
  to: number,
  epsilon: number,
  keep: Uint8Array,
): void {
  if (to - from < 2) return;
  let maxDist = 0;
  let maxIdx = -1;
  const a = points[from];
  const b = points[to];
  for (let i = from + 1; i < to; i++) {
    const d = perpendicularDistance(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxIdx === -1 || maxDist <= epsilon) return;
  keep[maxIdx] = 1;
  rdp(points, from, maxIdx, epsilon, keep);
  rdp(points, maxIdx, to, epsilon, keep);
}

function perpendicularDistance(
  p: PolygonPoint,
  a: PolygonPoint,
  b: PolygonPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return Math.sqrt(px * px + py * py);
  }
  // |((p - a) × (b - a))| / |b - a|
  const cross = (p.x - a.x) * dy - (p.y - a.y) * dx;
  return Math.abs(cross) / Math.sqrt(lenSq);
}

export interface FinalizeResult {
  ok: boolean;
  /** Defined when ok is true. The simplified, deduplicated polygon. */
  polygon?: PolygonPoint[];
  /** Why the polygon was rejected. */
  reason?: "too-few-vertices" | "too-small";
}

/**
 * Take the raw drag trail from the lasso and produce a region polygon, or
 * reject it as degenerate. Strips the trailing duplicate point if it
 * coincides with the first (the renderer closes the loop itself).
 */
export function finalizeLassoPolygon(
  raw: readonly PolygonPoint[],
  epsilon: number = DEFAULT_LASSO_EPSILON,
): FinalizeResult {
  const dedup = stripDuplicateClose(raw);
  const simplified = simplifyPolyline(dedup, epsilon);
  // Simplification may collapse repeated points at start/end into duplicates.
  const cleaned = stripDuplicateClose(simplified);
  if (cleaned.length < MIN_LASSO_VERTICES) {
    return { ok: false, reason: "too-few-vertices" };
  }
  const b = polygonBBox(cleaned);
  if (b.width * b.height < MIN_LASSO_BBOX_AREA) {
    return { ok: false, reason: "too-small" };
  }
  return { ok: true, polygon: cleaned };
}

function stripDuplicateClose(points: readonly PolygonPoint[]): PolygonPoint[] {
  if (points.length < 2) return points.slice();
  const out: PolygonPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    if (Math.abs(cur.x - prev.x) < 1e-6 && Math.abs(cur.y - prev.y) < 1e-6) {
      continue;
    }
    out.push(cur);
  }
  // Strip a closing point that matches the start (the renderer closes the loop).
  if (out.length >= 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
      out.pop();
    }
  }
  return out;
}
