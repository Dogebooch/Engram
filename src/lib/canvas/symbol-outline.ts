import {
  isImageSymbolLayer,
  isRegionSymbolLayer,
  type SymbolLayer,
} from "@/lib/types/canvas";

/**
 * A symbol counts as "resolved" (has a visual) when it is either a region layer
 * carrying a closed polygon (≥3 points) OR an image layer pointing at a real
 * `ref`. Missing layers and plain-rect regions still count as needing one —
 * they show up as the canvas "?" placeholder or an un-traced box. Single source
 * of truth for the chip trigger, the missing-outline detector, and the
 * walkthrough. (Named "outline" for history; an assigned image satisfies it
 * too — a Fact given a picture is done.)
 */
export function symbolHasOutline(layer: SymbolLayer | undefined): boolean {
  if (!layer) return false;
  if (isImageSymbolLayer(layer)) return layer.ref.trim().length > 0;
  return (
    isRegionSymbolLayer(layer) &&
    layer.shape === "polygon" &&
    (layer.points?.length ?? 0) >= 3
  );
}
