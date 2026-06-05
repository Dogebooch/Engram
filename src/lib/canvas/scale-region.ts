import type { OutlineRing } from "@/lib/types/canvas";

/**
 * Scale a single outline ring's offset, dimensions, and points by `(sx, sy)`.
 *
 * Used when a multi-outline region symbol is resized: the symbol is rendered as
 * a Konva Group whose scale must be baked into each child ring. Because rings
 * store offsets relative to the layer origin (see {@link OutlineRing}), scaling
 * the offset by the same factor keeps a ring's position correct under the
 * group's resize. The primary ring is a ring with `x:0, y:0` — scaling leaves
 * the origin at zero and just rescales its dimensions/points.
 */
export function scaleRing(ring: OutlineRing, sx: number, sy: number): OutlineRing {
  return {
    x: ring.x * sx,
    y: ring.y * sy,
    width: Math.max(8, ring.width * sx),
    height: Math.max(8, ring.height * sy),
    points: ring.points.map((p) => ({ x: p.x * sx, y: p.y * sy })),
  };
}
