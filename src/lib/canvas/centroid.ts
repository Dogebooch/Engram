import type { FactHotspots, SymbolLayer } from "@/lib/types/canvas";
import type { ParsedNotes } from "@/lib/notes/types";

export interface Point {
  x: number;
  y: number;
}

/**
 * World-space center of a symbol after rotation.
 *
 * Konva rotates around `{x, y}` (the top-left corner of the unrotated box),
 * so the visual center is the local center `(w/2, h/2)` rotated about origin.
 */
export function symbolCenter(layer: SymbolLayer): Point {
  const theta = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const halfW = layer.width / 2;
  const halfH = layer.height / 2;
  return {
    x: layer.x + halfW * cos - halfH * sin,
    y: layer.y + halfW * sin + halfH * cos,
  };
}

/**
 * Mean of the rotated centers of `symbols`. Returns null for empty input.
 */
export function meanCenter(symbols: readonly SymbolLayer[]): Point | null {
  if (symbols.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const s of symbols) {
    const c = symbolCenter(s);
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / symbols.length, y: sy / symbols.length };
}

/**
 * Effective half-extent of a symbol's rotation-invariant bounding circle.
 * Used to decide when a hotspot would land "inside" a symbol.
 */
function symbolRadius(s: SymbolLayer): number {
  return Math.max(s.width, s.height) / 2;
}

/**
 * Resolve a fact's hotspot anchor in world coordinates.
 *
 * Order of resolution:
 *   1. If the user has dragged this hotspot (`hotspots[factId].userOverride`),
 *      return the stored coordinates verbatim.
 *   2. Single-symbol fact → anchor at the upper-right of the symbol so the
 *      hotspot reads as a tag attached to the symbol rather than sitting
 *      on top of it (which makes it invisible against light artwork).
 *   3. Multi-symbol fact → mean of centers, then nudge away from the nearest
 *      linked symbol if the mean falls inside its body.
 *   4. No symbols → null (no hotspot rendered).
 */
export function getFactAnchor(
  factId: string,
  parsed: ParsedNotes,
  symbols: readonly SymbolLayer[],
  hotspots: FactHotspots,
): Point | null {
  const override = hotspots[factId];
  if (override?.userOverride) {
    return { x: override.x, y: override.y };
  }
  const fact = parsed.factsById.get(factId);
  if (!fact) return null;
  const symbolIds = new Set(fact.symbolRefs.map((r) => r.symbolId));
  if (symbolIds.size === 0) return null;
  const linked = symbols.filter((s) => symbolIds.has(s.id));
  if (linked.length === 0) return null;

  if (linked.length === 1) {
    const s = linked[0];
    const c = symbolCenter(s);
    const r = symbolRadius(s);
    // 0.78 keeps the hotspot just outside the symbol's body; the diagonal
    // offset reads as "tag in the upper-right corner".
    return { x: c.x + r * 0.78, y: c.y - r * 0.78 };
  }

  const mean = meanCenter(linked);
  if (!mean) return null;
  return nudgeOutOfSymbols(mean, linked);
}

/**
 * If `point` lies inside the bounding circle of any symbol, push it outward
 * just past that symbol's boundary along the symbol-to-point vector. Single
 * pass: handles the common 2-3 symbol clustering case; complex pathological
 * arrangements may still leave it inside a different symbol but the visual
 * effect is acceptable for v1.
 */
function nudgeOutOfSymbols(
  point: Point,
  linked: readonly SymbolLayer[],
): Point {
  let { x, y } = point;
  for (const s of linked) {
    const c = symbolCenter(s);
    const dx = x - c.x;
    const dy = y - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = symbolRadius(s) + 6; // 6px breathing room beyond hotspot edge
    if (dist >= minDist) continue;
    if (dist < 0.001) {
      // Point IS the symbol center — pick "up" as a stable default.
      x = c.x;
      y = c.y - minDist;
    } else {
      const k = minDist / dist;
      x = c.x + dx * k;
      y = c.y + dy * k;
    }
  }
  return { x, y };
}
