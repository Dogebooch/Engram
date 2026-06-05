"use client";

import * as React from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Transformer } from "react-konva";
import { useStore } from "@/lib/store";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import { scaleRing } from "@/lib/canvas/scale-region";
import { isRegionSymbolLayer } from "@/lib/types/canvas";

const ACCENT_FALLBACK = "oklch(0.68 0.095 52)";
const STAGE_FALLBACK = "oklch(0.255 0.025 188)";

interface CanvasTransformerProps {
  selectedIds: string[];
  symbolsKey: string;
  getNode: (
    id: string,
  ) => Konva.Image | Konva.Rect | Konva.Line | Konva.Group | null;
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
  const openSymbolContextMenu = useStore((s) => s.openSymbolContextMenu);
  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
  const anchorFill = useThemedCssVar("--stage", STAGE_FALLBACK) ?? STAGE_FALLBACK;

  React.useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => getNode(id))
      .filter(
        (n): n is Konva.Image | Konva.Rect | Konva.Line | Konva.Group =>
          n !== null,
      );
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, symbolsKey, getNode]);

  // `shouldOverdrawWholeArea` makes the Transformer eat pointer events inside
  // its bounding box (so drag-to-move works between anchors). Without this
  // handler, right-click on a selected symbol hits the Transformer overlay
  // and never reaches the underlying SymbolNode's onContextMenu.
  const handleContextMenu = React.useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      const sel = useStore.getState().selectedSymbolIds;
      if (sel.length === 0) return;
      openSymbolContextMenu(e.evt.clientX, e.evt.clientY, sel[0]);
    },
    [openSymbolContextMenu],
  );

  const handleTransformEnd = React.useCallback(
    (e: KonvaEventObject<Event>) => {
      const node = e.target as
        | Konva.Image
        | Konva.Rect
        | Konva.Line
        | Konva.Group;
      const id = node.id();
      if (!id) return;
      const sx = node.scaleX();
      const sy = node.scaleY();
      const state = useStore.getState();
      const cid = state.currentPicmonicId;
      const existing = cid
        ? state.picmonics[cid]?.canvas.symbols.find((sy) => sy.id === id)
        : null;
      if (existing && isRegionSymbolLayer(existing) && existing.shape === "polygon") {
        const newWidth = Math.max(8, existing.width * sx);
        const newHeight = Math.max(8, existing.height * sy);
        const points = existing.points?.map((p) => ({
          x: p.x * sx,
          y: p.y * sy,
        }));
        // Multi-ring symbols render as a Group; bake the group scale into every
        // extra ring (offsets, dimensions, and points) so they stay in sync.
        const extraOutlines = existing.extraOutlines?.map((ring) =>
          scaleRing(ring, sx, sy),
        );
        node.scaleX(1);
        node.scaleY(1);
        updateSymbol(id, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
          rotation: node.rotation(),
          points,
          ...(extraOutlines ? { extraOutlines } : {}),
        });
        return;
      }
      const newWidth = Math.max(8, node.width() * sx);
      const newHeight = Math.max(8, node.height() * sy);
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
      flipEnabled={false}
      ignoreStroke
      shouldOverdrawWholeArea
      onContextMenu={handleContextMenu}
      onTransformEnd={handleTransformEnd}
      boundBoxFunc={(_oldBox, newBox) => {
        if (newBox.width < 8 || newBox.height < 8) return _oldBox;
        return newBox;
      }}
    />
  );
}
