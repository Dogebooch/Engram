"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Line } from "react-konva";
import { useStore } from "@/lib/store";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import type { SymbolLayer } from "@/lib/types/canvas";
import { useCanvasTagDrag } from "./use-canvas-tag-drag";

const ACCENT_FALLBACK = "oklch(0.78 0.13 75)";
const EMPTY_POLY: readonly { x: number; y: number }[] = [];

interface RegionNodeProps {
  layer: SymbolLayer;
  selected: boolean;
  /** True when the editor cursor is sitting on this region's bullet. */
  glowing: boolean;
  /** True when this region is currently in vertex-edit mode. */
  editing: boolean;
  /** Set by canvas-stage when not in lasso mode. */
  interactive: boolean;
  /**
   * Multiplier on opacity. Today only Player uses dim != 1, but Player skips
   * region rendering entirely (the spotlight handles visual focus); kept for
   * symmetry with SymbolNode in case a future view enables interactive dim.
   */
  dimFactor: number;
}

/**
 * Region layer renderer. Three concentric strokes layer up from quiet to
 * insistent based on the layer's state:
 *
 *  1. **Base stroke** — always visible. Idle: 70% opacity hairline. Hover:
 *     full-opacity slightly thicker. Selected/editing: bold accent.
 *  2. **Halo stroke** — appears only on selected/editing/glowing. Dashed,
 *     offset outward, low opacity — gives the region a "this is the active
 *     thing" rim without doubling the visual weight of the inner stroke.
 *  3. **Glow shadow** — appears only when the cursor is on the bullet (the
 *     editor↔canvas sync), so the polygon visibly announces itself when the
 *     user's typing cursor lands inside it.
 *
 * Hit-testing uses an explicit `hitFunc` that fills the closed polygon, so
 * clicks anywhere inside the outline select the region (not just on the
 * 2-pixel stroke).
 */
export const RegionNode = React.memo(function RegionNode({
  layer,
  selected,
  glowing,
  editing,
  interactive,
  dimFactor,
}: RegionNodeProps) {
  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
  const selectGroupAware = useStore((s) => s.selectGroupAware);
  const toggleGroupAware = useStore((s) => s.toggleGroupAware);
  const openSymbolContextMenu = useStore((s) => s.openSymbolContextMenu);
  const setRegionEditingId = useStore((s) => s.setRegionEditingId);

  const tagDrag = useCanvasTagDrag(layer.id);

  const polygon = React.useMemo(() => layer.polygon ?? EMPTY_POLY, [layer.polygon]);

  const flatPoints = React.useMemo(() => {
    const out: number[] = [];
    for (const p of polygon) out.push(p.x, p.y);
    return out;
  }, [polygon]);

  const handleClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      if (e.evt.shiftKey) {
        toggleGroupAware(layer.id);
      } else if (e.evt.altKey) {
        setSelectedSymbolIds([layer.id]);
      } else {
        selectGroupAware(layer.id);
      }
    },
    [layer.id, selectGroupAware, setSelectedSymbolIds, toggleGroupAware],
  );

  const handleDblClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      setRegionEditingId(layer.id);
    },
    [layer.id, setRegionEditingId],
  );

  const handleContextMenu = React.useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      const sel = useStore.getState().selectedSymbolIds;
      if (!sel.includes(layer.id)) selectGroupAware(layer.id);
      openSymbolContextMenu(e.evt.clientX, e.evt.clientY, layer.id);
    },
    [layer.id, openSymbolContextMenu, selectGroupAware],
  );

  const handleMouseEnter = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "pointer";
    },
    [],
  );

  const handleMouseLeave = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "";
    },
    [],
  );

  // Custom hit shape: fill the closed polygon path so clicks anywhere
  // inside the region register, not just on the 2-pixel stroke.
  const hitFunc = React.useCallback(
    (ctx: Konva.Context, shape: Konva.Shape) => {
      if (polygon.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(polygon[i].x, polygon[i].y);
      }
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    },
    [polygon],
  );

  if (polygon.length < 3) return null;
  // In Study mode (interactive === false), regions are invisible — the
  // spotlight overlay handles all visual focus.
  if (!interactive) return null;

  // Visual hierarchy:
  //   active = selected || editing  → loud stroke + halo
  //   glow only (cursor on bullet) → loud stroke + halo, no fill change
  //   idle  → muted hairline
  const active = selected || editing;
  const showHalo = active || glowing;
  const baseStrokeOpacity = active || glowing ? 1 : 0.7;
  const baseStrokeWidth = editing ? 2.5 : selected ? 2.25 : glowing ? 2 : 1.5;

  return (
    <Group>
      {/*
        Halo stroke — sits OUTSIDE the polygon (offset via shadowOffset on
        the inner stroke isn't possible with Konva.Line, so we render a
        second slightly thicker stroke at low opacity, ringing the polygon
        with a soft outer halo. Dashed cadence reads as "ephemeral
        UI chrome", not "part of the artwork".
      */}
      {showHalo && (
        <Line
          points={flatPoints}
          closed
          stroke={accent}
          strokeWidth={baseStrokeWidth + 4}
          dash={editing ? [10, 5] : [4, 4]}
          opacity={editing ? 0.55 : 0.32}
          listening={false}
          fillEnabled={false}
          perfectDrawEnabled={false}
        />
      )}
      {/* Primary stroke + hit target. */}
      <Line
        id={layer.id}
        points={flatPoints}
        closed
        stroke={accent}
        strokeWidth={baseStrokeWidth}
        opacity={baseStrokeOpacity * dimFactor}
        fillEnabled={false}
        listening
        // Bullet-cursor sync: the glow shadow is the canvas's reply to the
        // editor cursor entering this token's range. Konva's perfectDraw
        // pass is what makes shadows render on transparent-fill shapes, so
        // turn it on here only — the cheaper path stays the default.
        perfectDrawEnabled={glowing}
        shadowEnabled={glowing}
        shadowColor={accent}
        shadowBlur={28}
        shadowOpacity={glowing ? 0.9 : 0}
        shadowOffsetX={0}
        shadowOffsetY={0}
        hitFunc={hitFunc}
        onClick={handleClick}
        onDblClick={handleDblClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        // The tag-drag hook expects a draggable node — but regions must NOT
        // free-drag on the stage. Solution: expose drag handlers but keep
        // draggable={false}. Tag drag listens on document mousemove, so it
        // still triggers from the bullet panel side. From the canvas side,
        // an explicit drag is suppressed by Konva when draggable is false.
        onDragStart={tagDrag.onDragStart}
        onDragEnd={tagDrag.onDragEnd}
        draggable={false}
      />
    </Group>
  );
});
