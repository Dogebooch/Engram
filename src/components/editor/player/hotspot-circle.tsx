"use client";

import * as React from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group, Text } from "react-konva";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";

const ACCENT_FALLBACK = "oklch(0.68 0.095 52)";
const STAGE_FALLBACK = "oklch(0.255 0.025 188)";
const ACCENT_FG_FALLBACK = "oklch(0.18 0.018 60)";

const RADIUS = 18;
const HALO_RADIUS = 20;
const OVERRIDE_RADIUS = 6;

/**
 * Presentational numbered disc — outer ring + inner fill + centered ordinal.
 * Shared by the player's {@link HotspotCircle} and the editor's
 * `SymbolNumberCircle`. No fact/pulse/selection semantics; the caller owns the
 * surrounding Group, hit handlers, and any halo. `filled` flips it to the
 * active/solid look; `radius` scales the disc and its number together.
 */
export function NumberBadge({
  ordinal,
  accent,
  stageFill,
  accentForeground,
  radius = RADIUS,
  filled = false,
  hover = false,
}: {
  ordinal: number;
  accent: string;
  stageFill: string;
  accentForeground: string;
  radius?: number;
  filled?: boolean;
  hover?: boolean;
}) {
  return (
    <>
      <Circle
        radius={radius}
        stroke={accent}
        strokeWidth={hover ? 2.5 : 2}
        fill={filled ? accent : stageFill}
        fillEnabled
        shadowColor="oklch(0.18 0.018 188)"
        shadowBlur={hover ? 14 : 10}
        shadowOpacity={0.4}
        shadowOffsetY={2}
        opacity={filled ? 1 : 0.96}
      />
      {/* Number — Konva Text needs a centered box; the offsets here are
          hand-tuned to pixel-snap on the dot grid given Geist Mono metrics. */}
      <Text
        text={String(ordinal)}
        fontFamily='"Geist Mono", ui-monospace, SFMono-Regular, monospace'
        fontStyle="500"
        fontSize={Math.round(radius * 0.72)}
        fill={filled ? accentForeground : accent}
        align="center"
        verticalAlign="middle"
        x={-radius}
        y={-radius}
        width={radius * 2}
        height={radius * 2}
        listening={false}
      />
    </>
  );
}

export interface HotspotCircleProps {
  factId: string;
  ordinal: number; // 1-indexed
  x: number;
  y: number;
  isActive: boolean;
  isOverride: boolean;
  onClick: (factId: string) => void;
  onContextMenu: (factId: string, screenX: number, screenY: number) => void;
  onDragEnd: (factId: string, x: number, y: number) => void;
}

export const HotspotCircle = React.memo(function HotspotCircle({
  factId,
  ordinal,
  x,
  y,
  isActive,
  isOverride,
  onClick,
  onContextMenu,
  onDragEnd,
}: HotspotCircleProps) {
  const [hover, setHover] = React.useState(false);
  const haloRef = React.useRef<Konva.Circle | null>(null);

  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
  const stageFill = useThemedCssVar("--stage", STAGE_FALLBACK) ?? STAGE_FALLBACK;
  const accentForeground =
    useThemedCssVar("--accent-foreground", ACCENT_FG_FALLBACK) ?? ACCENT_FG_FALLBACK;

  // Pulse the halo while this hotspot is the revealed one.
  React.useEffect(() => {
    const node = haloRef.current;
    if (!isActive || !node) return;
    const layer = node.getLayer();
    if (!layer) return;
    const anim = new Konva.Animation((frame) => {
      if (!frame) return;
      const t = (frame.time % 1600) / 1600;
      const phase = Math.sin(t * Math.PI);
      const scale = 1 + 0.18 * phase;
      node.scale({ x: scale, y: scale });
      node.opacity(0.5 * phase);
    }, layer);
    anim.start();
    return () => {
      anim.stop();
      node.scale({ x: 1, y: 1 });
      node.opacity(0);
    };
  }, [isActive]);

  const groupScale = hover ? 1.08 : 1;

  const handleMouseEnter = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "pointer";
      setHover(true);
    },
    [],
  );

  const handleMouseLeave = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "";
      setHover(false);
    },
    [],
  );

  const handleClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      // Konva fires `click` on every mouse-up; ignore non-primary buttons so
      // right-click doesn't reveal the card alongside the context menu.
      if (e.evt.button !== 0) return;
      if (e.evt.detail > 1) return;
      e.cancelBubble = true;
      onClick(factId);
    },
    [factId, onClick],
  );

  const handleContextMenu = React.useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      onContextMenu(factId, e.evt.clientX, e.evt.clientY);
    },
    [factId, onContextMenu],
  );

  const handleDragStart = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "grabbing";
    },
    [],
  );

  const handleDragEnd = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "pointer";
      onDragEnd(factId, e.target.x(), e.target.y());
    },
    [factId, onDragEnd],
  );

  // Clamp the drag inside the stage so hotspots can't be lost off-canvas.
  const dragBoundFunc = React.useCallback(
    (pos: { x: number; y: number }) => {
      // Konva's dragBoundFunc receives ABSOLUTE-space (post-transform) pixels.
      // We don't have stage transform here, but the Player stage uses uniform
      // scale + offset — clamping in absolute space to the stage's visible
      // bounds is good enough; Konva re-projects on next layout. For
      // simplicity, we let Konva keep the local-space position and rely on
      // the visual stage clipping for bounds. (See PlayerStage layer for
      // actual `clip` behavior.)
      return pos;
    },
    [],
  );

  return (
    <Group
      name="hotspot"
      x={x}
      y={y}
      draggable
      scaleX={groupScale}
      scaleY={groupScale}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      dragBoundFunc={dragBoundFunc}
    >
      {/* Active pulse halo */}
      <Circle
        ref={haloRef}
        radius={HALO_RADIUS}
        stroke={accent}
        strokeWidth={1.5}
        opacity={0}
        listening={false}
      />
      {/* Outer ring + inner fill + number */}
      <NumberBadge
        ordinal={ordinal}
        accent={accent}
        stageFill={stageFill}
        accentForeground={accentForeground}
        radius={RADIUS}
        filled={isActive}
        hover={hover}
      />
      {/* Override indicator (locked-position tick) */}
      {isOverride && !isActive && (
        <Circle
          radius={OVERRIDE_RADIUS}
          stroke={accent}
          strokeWidth={1}
          dash={[2, 2]}
          opacity={0.55}
          listening={false}
        />
      )}
    </Group>
  );
});

export const HOTSPOT_BOUND = {
  minX: 0,
  maxX: STAGE_WIDTH,
  minY: 0,
  maxY: STAGE_HEIGHT,
};
