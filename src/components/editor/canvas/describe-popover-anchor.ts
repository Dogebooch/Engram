export interface AnchorFitBox {
  /** Stage→screen scale (uniform). */
  scale: number;
  /** Paper left/top within the canvas container, in px. */
  offsetX: number;
  offsetY: number;
  /** Paper size in px. */
  width: number;
  height: number;
}

export interface AnchorRegion {
  /** Region bounding box, in stage coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnchorSize {
  width: number;
  height: number;
}

export interface PopoverAnchor {
  left: number;
  top: number;
  side: "below" | "above";
}

const GAP = 10;

/**
 * Place the describe popover within the canvas container, anchored to a
 * region's bounding box. Prefers sitting just below the region; flips above
 * when there isn't room below. Horizontally centered on the region and clamped
 * so the popover stays fully inside the container.
 *
 * Pure: region is in stage coords, `box` is the canvas-stage fit transform
 * (uniform scale + centered offset — the stage has no pan/zoom), `container`
 * is the root div size in px. Returns container-relative px for `left`/`top`.
 */
export function computePopoverAnchor(
  region: AnchorRegion,
  box: AnchorFitBox,
  container: AnchorSize,
  popover: AnchorSize,
): PopoverAnchor {
  const rx = box.offsetX + region.x * box.scale;
  const ry = box.offsetY + region.y * box.scale;
  const rw = region.width * box.scale;
  const rh = region.height * box.scale;

  const maxLeft = Math.max(GAP, container.width - popover.width - GAP);
  const left = Math.min(Math.max(GAP, rx + rw / 2 - popover.width / 2), maxLeft);

  const belowTop = ry + rh + GAP;
  const aboveTop = ry - popover.height - GAP;
  if (belowTop + popover.height + GAP <= container.height) {
    return { left, top: belowTop, side: "below" };
  }
  if (aboveTop >= GAP) {
    return { left, top: aboveTop, side: "above" };
  }
  // Region fills the viewport in both directions: clamp on-screen, below-ish.
  const top = Math.min(
    Math.max(GAP, belowTop),
    Math.max(GAP, container.height - popover.height - GAP),
  );
  return { left, top, side: "below" };
}
