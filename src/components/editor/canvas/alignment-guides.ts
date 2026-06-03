import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import type { SymbolLayer } from "@/lib/types/canvas";

export const ALIGN_GUIDE_TOLERANCE = 4;

export interface AlignmentGuide {
  /** Pair of points (x1,y1,x2,y2) in world space defining the guide line. */
  points: [number, number, number, number];
}

interface Edges {
  left: number;
  right: number;
  centerX: number;
  top: number;
  bottom: number;
  centerY: number;
}

function edgesOf(s: { x: number; y: number; width: number; height: number }): Edges {
  return {
    left: s.x,
    right: s.x + s.width,
    centerX: s.x + s.width / 2,
    top: s.y,
    bottom: s.y + s.height,
    centerY: s.y + s.height / 2,
  };
}

interface SnapResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

/**
 * Given a dragging symbol's bounding rect and a list of siblings, return:
 *  - a snapped (x, y) where left/centerX/right or top/centerY/bottom of the
 *    symbol coincides with the same edge of any sibling, when within the
 *    tolerance, AND
 *  - the guide lines (full stage span on the matching axis) to render.
 *
 * Rotated symbols are aligned by their AABB (axis-aligned in world space) for
 * v1 simplicity — most outline placements stay axis-aligned.
 */
export function computeAlignmentGuides(
  dragging: { x: number; y: number; width: number; height: number },
  siblings: readonly SymbolLayer[],
  tolerance = ALIGN_GUIDE_TOLERANCE,
): SnapResult {
  const guides: AlignmentGuide[] = [];
  const dEdges = edgesOf(dragging);
  let snapX: number | null = null;
  let snapY: number | null = null;
  let bestDxDelta = tolerance + 1;
  let bestDyDelta = tolerance + 1;

  for (const sib of siblings) {
    const e = edgesOf(sib);
    // X-axis pairs: dragging-left vs sibling-left/right/centerX, and so on.
    const xPairs: Array<{ d: number; line: number; symbolEdge: keyof Edges }> = [
      { d: dEdges.left, line: e.left, symbolEdge: "left" },
      { d: dEdges.left, line: e.right, symbolEdge: "left" },
      { d: dEdges.right, line: e.left, symbolEdge: "right" },
      { d: dEdges.right, line: e.right, symbolEdge: "right" },
      { d: dEdges.centerX, line: e.centerX, symbolEdge: "centerX" },
    ];
    for (const p of xPairs) {
      const delta = Math.abs(p.d - p.line);
      if (delta > tolerance) continue;
      // Snap by adjusting the dragging x so the named edge sits on p.line.
      let nextX = dragging.x;
      if (p.symbolEdge === "left") nextX = p.line;
      else if (p.symbolEdge === "right") nextX = p.line - dragging.width;
      else if (p.symbolEdge === "centerX") nextX = p.line - dragging.width / 2;
      if (delta < bestDxDelta) {
        bestDxDelta = delta;
        snapX = nextX;
      }
      guides.push({ points: [p.line, 0, p.line, STAGE_HEIGHT] });
    }
    const yPairs: Array<{ d: number; line: number; symbolEdge: keyof Edges }> = [
      { d: dEdges.top, line: e.top, symbolEdge: "top" },
      { d: dEdges.top, line: e.bottom, symbolEdge: "top" },
      { d: dEdges.bottom, line: e.top, symbolEdge: "bottom" },
      { d: dEdges.bottom, line: e.bottom, symbolEdge: "bottom" },
      { d: dEdges.centerY, line: e.centerY, symbolEdge: "centerY" },
    ];
    for (const p of yPairs) {
      const delta = Math.abs(p.d - p.line);
      if (delta > tolerance) continue;
      let nextY = dragging.y;
      if (p.symbolEdge === "top") nextY = p.line;
      else if (p.symbolEdge === "bottom") nextY = p.line - dragging.height;
      else if (p.symbolEdge === "centerY") nextY = p.line - dragging.height / 2;
      if (delta < bestDyDelta) {
        bestDyDelta = delta;
        snapY = nextY;
      }
      guides.push({ points: [0, p.line, STAGE_WIDTH, p.line] });
    }
  }

  return {
    x: snapX ?? dragging.x,
    y: snapY ?? dragging.y,
    guides,
  };
}
