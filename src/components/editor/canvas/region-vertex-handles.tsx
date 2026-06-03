"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group, Layer } from "react-konva";
import {
  deleteRegionVertex,
  insertRegionVertex,
  updateRegionVertex,
} from "@/lib/canvas/add-symbol-with-note-sync";
import { useStore } from "@/lib/store";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import type { SymbolLayer } from "@/lib/types/canvas";

const ACCENT_FALLBACK = "oklch(0.78 0.13 75)";
const STAGE_FALLBACK = "oklch(0.105 0 0)";

const HANDLE_RADIUS = 6;
const MIDPOINT_RADIUS = 4;

interface RegionVertexHandlesProps {
  region: SymbolLayer;
  /** Stage scale — handles render at constant pixel size regardless of zoom. */
  stageScale: number;
}

/**
 * Vertex-edit overlay for a single region. Renders a circle on every
 * polygon vertex (drag to move, double-click to delete) plus smaller
 * "midpoint" circles on every edge (click to insert a new vertex). The
 * Layer is mounted by canvas-stage only when ui.regionEditingId points at
 * this exact layer.
 */
export function RegionVertexHandles({
  region,
  stageScale,
}: RegionVertexHandlesProps) {
  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
  const anchorFill = useThemedCssVar("--stage", STAGE_FALLBACK) ?? STAGE_FALLBACK;

  const polygon = region.polygon ?? [];
  if (polygon.length < 3) return null;

  const sc = stageScale > 0 ? stageScale : 1;
  const r = HANDLE_RADIUS / sc;
  const mr = MIDPOINT_RADIUS / sc;
  const stroke = 1.25 / sc;

  return (
    <Layer name="region-vertex-handles">
      {polygon.map((p, i) => (
        <VertexHandle
          key={`v-${i}`}
          regionId={region.id}
          index={i}
          x={p.x}
          y={p.y}
          radius={r}
          stroke={accent}
          strokeWidth={stroke}
          fill={anchorFill}
          canDelete={polygon.length > 3}
        />
      ))}
      {polygon.map((p, i) => {
        const next = polygon[(i + 1) % polygon.length];
        const mx = (p.x + next.x) / 2;
        const my = (p.y + next.y) / 2;
        return (
          <MidpointHandle
            key={`m-${i}`}
            regionId={region.id}
            insertAt={i + 1}
            x={mx}
            y={my}
            radius={mr}
            stroke={accent}
            strokeWidth={stroke}
            fill={anchorFill}
          />
        );
      })}
    </Layer>
  );
}

interface VertexHandleProps {
  regionId: string;
  index: number;
  x: number;
  y: number;
  radius: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  canDelete: boolean;
}

function VertexHandle({
  regionId,
  index,
  x,
  y,
  radius,
  stroke,
  strokeWidth,
  fill,
  canDelete,
}: VertexHandleProps) {
  const groupRef = React.useRef<Konva.Group | null>(null);

  // Snap the dragged group back to its prop coordinates after Konva commits
  // the drag — without this, the next prop update doesn't reset the node's
  // internal position and the handle "drifts" relative to the polygon.
  const handleDragMove = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const nx = node.x();
      const ny = node.y();
      updateRegionVertex(regionId, index, { x: nx, y: ny });
    },
    [regionId, index],
  );

  const handleDragEnd = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const node = e.target;
      updateRegionVertex(regionId, index, { x: node.x(), y: node.y() });
    },
    [regionId, index],
  );

  const handleDblClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      if (!canDelete) return;
      deleteRegionVertex(regionId, index);
    },
    [canDelete, regionId, index],
  );

  const handleMouseEnter = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "grab";
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

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      draggable
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDblClick={handleDblClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Circle
        radius={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Group>
  );
}

interface MidpointHandleProps {
  regionId: string;
  /** Polygon index AFTER which the new vertex should be inserted. */
  insertAt: number;
  x: number;
  y: number;
  radius: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

function MidpointHandle({
  regionId,
  insertAt,
  x,
  y,
  radius,
  stroke,
  strokeWidth,
  fill,
}: MidpointHandleProps) {
  const setRegionEditingId = useStore((s) => s.setRegionEditingId);

  const handleClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      const inserted = insertRegionVertex(regionId, insertAt, { x, y });
      if (inserted >= 0) {
        // Keep edit mode focused on the same region after insertion.
        setRegionEditingId(regionId);
      }
    },
    [regionId, insertAt, x, y, setRegionEditingId],
  );

  const handleMouseEnter = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "copy";
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

  return (
    <Circle
      x={x}
      y={y}
      radius={radius}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={0.6}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
}
