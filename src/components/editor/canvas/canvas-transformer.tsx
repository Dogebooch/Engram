"use client";

import * as React from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Transformer } from "react-konva";
import { useStore } from "@/lib/store";

interface CanvasTransformerProps {
  selectedIds: string[];
  symbolsKey: string;
  getNode: (id: string) => Konva.Image | null;
}

const ANCHOR_SIZE = 8;
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

export function CanvasTransformer({
  selectedIds,
  symbolsKey,
  getNode,
}: CanvasTransformerProps) {
  const transformerRef = React.useRef<Konva.Transformer | null>(null);
  const updateSymbol = useStore((s) => s.updateSymbol);

  React.useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => getNode(id))
      .filter((n): n is Konva.Image => n !== null);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, symbolsKey, getNode]);

  const handleTransformEnd = React.useCallback(
    (e: KonvaEventObject<Event>) => {
      const node = e.target as Konva.Image;
      const id = node.id();
      if (!id) return;
      const newWidth = Math.max(8, node.width() * node.scaleX());
      const newHeight = Math.max(8, node.height() * node.scaleY());
      node.scaleX(1);
      node.scaleY(1);
      updateSymbol(id, {
        x: node.x(),
        y: node.y(),
        width: newWidth,
        height: newHeight,
        rotation: node.rotation(),
      });
    },
    [updateSymbol],
  );

  if (selectedIds.length === 0) return null;

  return (
    <Transformer
      ref={transformerRef}
      anchorSize={ANCHOR_SIZE}
      anchorStroke="#1a1a1a"
      anchorFill="#f5d77a"
      anchorStrokeWidth={1.5}
      anchorCornerRadius={2}
      borderStroke="#f5d77a"
      borderStrokeWidth={1}
      borderDash={[4, 4]}
      rotationSnaps={ROTATION_SNAPS}
      rotationSnapTolerance={6}
      keepRatio={false}
      ignoreStroke
      shouldOverdrawWholeArea
      onTransformEnd={handleTransformEnd}
      boundBoxFunc={(_oldBox, newBox) => {
        if (newBox.width < 8 || newBox.height < 8) return _oldBox;
        return newBox;
      }}
    />
  );
}
