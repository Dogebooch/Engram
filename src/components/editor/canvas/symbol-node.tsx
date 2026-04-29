"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import { useImage } from "@/lib/image-cache";
import { useStore } from "@/lib/store";
import { getSymbolById } from "@/lib/symbols";
import type { SymbolLayer } from "@/lib/types/canvas";

interface SymbolNodeProps {
  layer: SymbolLayer;
  selected: boolean;
  onMount: (id: string, node: Konva.Image | null) => void;
}

export const SymbolNode = React.memo(function SymbolNode({
  layer,
  selected,
  onMount,
}: SymbolNodeProps) {
  const entry = getSymbolById(layer.ref);
  const url = entry?.imageUrl ?? null;
  const state = useImage(url);

  const updateSymbol = useStore((s) => s.updateSymbol);
  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
  const toggleSymbolSelection = useStore((s) => s.toggleSymbolSelection);

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
        toggleSymbolSelection(layer.id);
      } else {
        setSelectedSymbolIds([layer.id]);
      }
    },
    [layer.id, setSelectedSymbolIds, toggleSymbolSelection],
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

  const handleDragStart = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "grabbing";
    },
    [],
  );

  const handleDragEnd = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const node = e.target;
      updateSymbol(layer.id, { x: node.x(), y: node.y() });
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "grab";
    },
    [layer.id, updateSymbol],
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
      draggable
      perfectDrawEnabled={false}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    />
  );
});
