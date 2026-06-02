import { isRegionSymbolLayer, type SymbolLayer } from "@/lib/types/canvas";

/**
 * A symbol "has an outline" only when it is a region layer carrying a closed
 * polygon (≥3 points). Missing layers, image layers, and plain-rect regions
 * all count as needing one — they show up as the canvas "?" placeholder or an
 * un-traced box. Single source of truth for the chip trigger, the
 * missing-outline detector, and the walkthrough.
 */
export function symbolHasOutline(layer: SymbolLayer | undefined): boolean {
  return (
    !!layer &&
    isRegionSymbolLayer(layer) &&
    layer.shape === "polygon" &&
    (layer.points?.length ?? 0) >= 3
  );
}
