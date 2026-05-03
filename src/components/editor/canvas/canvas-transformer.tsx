"use client";

import * as React from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Transformer } from "react-konva";
import { useStore } from "@/lib/store";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";

const ACCENT_FALLBACK = "oklch(0.78 0.13 75)";
const STAGE_FALLBACK = "oklch(0.105 0 0)";

interface CanvasTransformerProps {
  selectedIds: string[];
  symbolsKey: string;
  getNode: (id: string) => Konva.Image | null;
}

const ANCHOR_SIZE = 9;
const ROTATION_SNAPS = [0, 90, 180, 270];

// Inline rotate icon (lucide rotate-cw paths) with a black halo + white stroke
// so the cursor reads on any canvas background.
const ROTATE_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">' +
  '<g stroke="black" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
  '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>' +
  '<path d="M21 3v5h-5"/>' +
  '</g>' +
  '<g stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
  '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>' +
  '<path d="M21 3v5h-5"/>' +
  '</g>' +
  '</svg>';
const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(ROTATE_CURSOR_SVG)}") 16 16, crosshair`;

export function CanvasTransformer({
  selectedIds,
  symbolsKey,
  getNode,
}: CanvasTransformerProps) {
  const transformerRef = React.useRef<Konva.Transformer | null>(null);
  const updateSymbol = useStore((s) => s.updateSymbol);
  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
  const anchorFill = useThemedCssVar("--stage", STAGE_FALLBACK) ?? STAGE_FALLBACK;

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
      anchorFill={anchorFill}
      anchorStroke={accent}
      anchorStrokeWidth={1.25}
      anchorCornerRadius={1.5}
      borderStroke={accent}
      borderStrokeWidth={1}
      borderDash={[3, 3]}
      padding={4}
      rotateAnchorOffset={30}
      rotateAnchorCursor={ROTATE_CURSOR}
      rotateLineVisible={false}
      rotationSnaps={ROTATION_SNAPS}
      rotationSnapTolerance={4}
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
