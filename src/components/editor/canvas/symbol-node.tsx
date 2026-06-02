"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Image as KonvaImage, Line, Rect, Text } from "react-konva";
import { useImage } from "@/lib/image-cache";
import { useStore } from "@/lib/store";
import { getSymbolById, useSymbolsReady } from "@/lib/symbols";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import { isRegionSymbolLayer, type SymbolLayer } from "@/lib/types/canvas";
import { useCanvasTagDrag } from "./use-canvas-tag-drag";

const ACCENT_FALLBACK = "oklch(0.78 0.13 75)";
const DESTRUCTIVE_FALLBACK = "oklch(0.7 0.19 22)";
const FOREGROUND_FALLBACK = "oklch(0.96 0 0)";
const PLACEHOLDER_FILL_FALLBACK = "oklch(1 0 0 / 0.04)";
const PLACEHOLDER_FILL_WEAK_FALLBACK = "oklch(1 0 0 / 0.02)";
const PLACEHOLDER_FILL_STRONG_FALLBACK = "oklch(1 0 0 / 0.18)";

interface SymbolNodeProps {
  layer: SymbolLayer;
  selected: boolean;
  glowing: boolean;
  onMount: (id: string, node: Konva.Image | Konva.Rect | Konva.Line | null) => void;
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
  const symbolsReady = useSymbolsReady();
  const isRegion = isRegionSymbolLayer(layer);
  const entry = isRegion ? null : getSymbolById(layer.ref);
  const url = entry?.imageUrl ?? null;
  const state = useImage(url);
  const [regionHover, setRegionHover] = React.useState(false);

  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
  const selectGroupAware = useStore((s) => s.selectGroupAware);
  const toggleGroupAware = useStore((s) => s.toggleGroupAware);
  const openSymbolContextMenu = useStore((s) => s.openSymbolContextMenu);

  const tagDrag = useCanvasTagDrag(layer.id);

  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
  const foreground =
    useThemedCssVar("--foreground", FOREGROUND_FALLBACK) ?? FOREGROUND_FALLBACK;
  const destructive =
    useThemedCssVar("--destructive", DESTRUCTIVE_FALLBACK) ?? DESTRUCTIVE_FALLBACK;
  const placeholderFill =
    useThemedCssVar("--canvas-placeholder-fill", PLACEHOLDER_FILL_FALLBACK) ??
    PLACEHOLDER_FILL_FALLBACK;
  const placeholderFillWeak =
    useThemedCssVar("--canvas-placeholder-fill-weak", PLACEHOLDER_FILL_WEAK_FALLBACK) ??
    PLACEHOLDER_FILL_WEAK_FALLBACK;
  const placeholderFillStrong =
    useThemedCssVar("--canvas-placeholder-fill-strong", PLACEHOLDER_FILL_STRONG_FALLBACK) ??
    PLACEHOLDER_FILL_STRONG_FALLBACK;

  const imageRef = React.useRef<Konva.Image | null>(null);
  const regionRef = React.useRef<Konva.Rect | Konva.Line | null>(null);

  const handleRef = React.useCallback(
    (node: Konva.Image | null) => {
      imageRef.current = node;
      onMount(layer.id, node);
    },
    [layer.id, onMount],
  );

  const handleRegionRef = React.useCallback(
    (node: Konva.Rect | Konva.Line | null) => {
      regionRef.current = node;
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

  const handleRegionMouseEnter = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      handleMouseEnter(e);
      setRegionHover(true);
    },
    [handleMouseEnter],
  );

  const handleRegionMouseLeave = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      handleMouseLeave(e);
      setRegionHover(false);
    },
    [handleMouseLeave],
  );

  if (isRegion) {
    const visible = interactive || selected || glowing;
    if (!visible) return null;
    const active = selected || glowing || regionHover;
    const strokeWidth = active ? 3.25 : 1.25;
    const strokeOpacity = active ? 1 : 0.56;
    const fillOpacity = glowing ? 0.2 : selected ? 0.14 : regionHover ? 0.1 : 0;
    const contrastStrokeWidth = strokeWidth + 3;
    const contrastOpacity = active ? 0.42 * dimFactor : 0;
    const commonRegionProps = {
      id: layer.id,
      name: "export-chrome",
      x: layer.x,
      y: layer.y,
      rotation: layer.rotation,
      stroke: accent,
      strokeWidth,
      dash: active ? undefined : [8, 5],
      opacity: strokeOpacity * dimFactor,
      shadowEnabled: active,
      shadowColor: accent,
      shadowBlur: active ? 18 : 0,
      shadowOpacity: active ? 0.55 : 0,
      draggable: interactive,
      listening: interactive,
      perfectDrawEnabled: false,
      onClick: interactive ? handleClick : undefined,
      onContextMenu: interactive ? handleContextMenu : undefined,
      onMouseEnter: interactive ? handleRegionMouseEnter : undefined,
      onMouseLeave: interactive ? handleRegionMouseLeave : undefined,
      onDragStart: interactive ? tagDrag.onDragStart : undefined,
      onDragEnd: interactive ? tagDrag.onDragEnd : undefined,
    };
    if (layer.shape === "polygon" && layer.points && layer.points.length >= 3) {
      const points = layer.points.flatMap((p) => [p.x, p.y]);
      return (
        <>
          {fillOpacity > 0 && (
            <Line
              name="export-chrome"
              x={layer.x}
              y={layer.y}
              rotation={layer.rotation}
              points={points}
              closed
              fill={accent}
              opacity={fillOpacity * dimFactor}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
          {contrastOpacity > 0 && (
            <Line
              name="export-chrome"
              x={layer.x}
              y={layer.y}
              rotation={layer.rotation}
              points={points}
              closed
              stroke={foreground}
              strokeWidth={contrastStrokeWidth}
              opacity={contrastOpacity}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
          <Line
            ref={handleRegionRef}
            {...commonRegionProps}
            points={points}
            closed
            fillEnabled={false}
            hitStrokeWidth={12}
          />
        </>
      );
    }
    return (
      <>
        {fillOpacity > 0 && (
          <Rect
            name="export-chrome"
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            rotation={layer.rotation}
            fill={accent}
            opacity={fillOpacity * dimFactor}
            listening={false}
            perfectDrawEnabled={false}
          />
        )}
        {contrastOpacity > 0 && (
          <Rect
            name="export-chrome"
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            rotation={layer.rotation}
            stroke={foreground}
            strokeWidth={contrastStrokeWidth}
            opacity={contrastOpacity}
            listening={false}
            perfectDrawEnabled={false}
          />
        )}
        <Rect
          ref={handleRegionRef}
          {...commonRegionProps}
          width={layer.width}
          height={layer.height}
          fillEnabled={false}
        />
      </>
    );
  }

  // Library cache hasn't populated yet — hold rendering as a neutral
  // placeholder rather than flashing the destructive "broken" state.
  // Once `useSymbolsReady` flips to true, the component re-renders and
  // `getSymbolById` will resolve.
  if (!entry && !symbolsReady) {
    return (
      <Rect
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation}
        fill={placeholderFill}
        cornerRadius={4}
        listening={false}
      />
    );
  }

  if (state.status === "loading") {
    return (
      <Rect
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation}
        fill={placeholderFill}
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
          stroke={selected ? accent : placeholderFillStrong}
          strokeWidth={selected ? 1.5 : 1}
          dash={[6, 6]}
          fill={placeholderFillWeak}
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
          fill={destructive}
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
      // Konva skips the offscreen-buffer pass when perfectDrawEnabled is
      // false, which also skips shadow rendering for transparent-fill
      // shapes like our PNG symbols. Turn it on only when a glow is active
      // so the cheap path stays the default and the shadow renders during
      // hotspot reveal / cursor-on-bullet sync.
      perfectDrawEnabled={showGlow}
      shadowEnabled={showGlow}
      shadowColor={accent}
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
