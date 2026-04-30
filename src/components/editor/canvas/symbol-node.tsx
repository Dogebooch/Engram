"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import { useImage } from "@/lib/image-cache";
import { useStore } from "@/lib/store";
import { getSymbolById } from "@/lib/symbols";
import type { SymbolLayer } from "@/lib/types/canvas";
import { useCanvasTagDrag } from "./use-canvas-tag-drag";

interface SymbolNodeProps {
  layer: SymbolLayer;
  selected: boolean;
  glowing: boolean;
  onMount: (id: string, node: Konva.Image | null) => void;
  /**
   * When false, disables drag/click/contextMenu/tagDrag handlers. Used by the
   * Player view to render symbols read-only.
   */
  interactive?: boolean;
  /**
   * Multiplier applied to the rendered image opacity. Used by Player's
   * Sequential mode to dim symbols not linked to the current fact.
   */
  dimFactor?: number;
}

export const SymbolNode = React.memo(function SymbolNode({
  layer,
  selected,
  glowing,
  onMount,
  interactive = true,
  dimFactor = 1,
}: SymbolNodeProps) {
  const entry = getSymbolById(layer.ref);
  const url = entry?.imageUrl ?? null;
  const state = useImage(url);

  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
  const selectGroupAware = useStore((s) => s.selectGroupAware);
  const toggleGroupAware = useStore((s) => s.toggleGroupAware);
  const openSymbolContextMenu = useStore((s) => s.openSymbolContextMenu);

  const tagDrag = useCanvasTagDrag(layer.id);

  const imageRef = React.useRef<Konva.Image | null>(null);

  const handleRef = React.useCallback(
    (node: Konva.Image | null) => {
      imageRef.current = node;
      onMount(layer.id, node);
    },
    [layer.id, onMount],
  );

  React.useEffect(() => {
    return () => {
      onMount(layer.id, null);
    };
  }, [layer.id, onMount]);

  const handleClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      if (e.evt.shiftKey) {
        toggleGroupAware(layer.id);
      } else if (e.evt.altKey) {
        // Alt-click bypasses group expansion (single-symbol select).
        setSelectedSymbolIds([layer.id]);
      } else {
        selectGroupAware(layer.id);
      }
    },
    [layer.id, selectGroupAware, setSelectedSymbolIds, toggleGroupAware],
  );

  const handleContextMenu = React.useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      const sel = useStore.getState().selectedSymbolIds;
      // If the right-clicked symbol isn't already selected, select it
      // (group-aware) so menu actions target the visually-active set.
      if (!sel.includes(layer.id)) {
        selectGroupAware(layer.id);
      }
      openSymbolContextMenu(e.evt.clientX, e.evt.clientY, layer.id);
    },
    [layer.id, openSymbolContextMenu, selectGroupAware],
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

  if (state.status === "loading") {
    return (
      <Rect
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation}
        fill="rgba(255,255,255,0.04)"
        cornerRadius={4}
        listening={false}
      />
    );
  }

  if (state.status === "error" || !entry) {
    return (
      <Group
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Rect
          width={layer.width}
          height={layer.height}
          stroke={selected ? "oklch(0.78 0.13 75)" : "rgba(255,255,255,0.18)"}
          strokeWidth={selected ? 1.5 : 1}
          dash={[6, 6]}
          fill="rgba(255,255,255,0.02)"
          cornerRadius={4}
        />
        <Text
          text="?"
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          align="center"
          verticalAlign="middle"
          fontSize={Math.min(layer.width, layer.height) * 0.45}
          fill="oklch(0.65 0.18 25)"
          listening={false}
        />
      </Group>
    );
  }

  const showGlow = glowing && !selected;

  return (
    <KonvaImage
      ref={handleRef}
      id={layer.id}
      image={state.image}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={dimFactor}
      draggable={interactive}
      listening={interactive}
      perfectDrawEnabled={false}
      shadowEnabled={showGlow}
      shadowColor="oklch(0.78 0.13 75)"
      shadowBlur={28}
      shadowOpacity={showGlow ? 1 : 0}
      shadowOffsetX={0}
      shadowOffsetY={0}
      onClick={interactive ? handleClick : undefined}
      onContextMenu={interactive ? handleContextMenu : undefined}
      onMouseEnter={interactive ? handleMouseEnter : undefined}
      onMouseLeave={interactive ? handleMouseLeave : undefined}
      onDragStart={interactive ? tagDrag.onDragStart : undefined}
      onDragEnd={interactive ? tagDrag.onDragEnd : undefined}
    />
  );
});
