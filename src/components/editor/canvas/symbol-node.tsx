"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import { useImage } from "@/lib/image-cache";
import { useStore } from "@/lib/store";
import { getSymbolById, useSymbolsReady } from "@/lib/symbols";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import type { SymbolLayer } from "@/lib/types/canvas";
import { useCanvasTagDrag } from "./use-canvas-tag-drag";

const ACCENT_FALLBACK = "oklch(0.78 0.13 75)";
const DESTRUCTIVE_FALLBACK = "oklch(0.7 0.19 22)";
const PLACEHOLDER_FILL_FALLBACK = "oklch(1 0 0 / 0.04)";
const PLACEHOLDER_FILL_WEAK_FALLBACK = "oklch(1 0 0 / 0.02)";
const PLACEHOLDER_FILL_STRONG_FALLBACK = "oklch(1 0 0 / 0.18)";

interface SymbolNodeProps {
  layer: SymbolLayer;
  selected: boolean;
  glowing: boolean;
  onMount: (id: string, node: Konva.Node | null) => void;
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
  /**
   * 1-based ordinal among region-typed symbols. Drives the small numbered
   * chip rendered at a region marker's top-left corner. Undefined for
   * non-region SymbolLayers.
   */
  regionOrdinal?: number;
}

const REGION_REF_PREFIX = "region:";
const BADGE_W = 22;
const BADGE_H = 14;
const BADGE_MARGIN = 4;

export const SymbolNode = React.memo(function SymbolNode({
  layer,
  selected,
  glowing,
  onMount,
  interactive = true,
  dimFactor = 1,
  regionOrdinal,
}: SymbolNodeProps) {
  const symbolsReady = useSymbolsReady();
  const entry = getSymbolById(layer.ref);
  const url = entry?.imageUrl ?? null;
  const state = useImage(url);

  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
  const selectGroupAware = useStore((s) => s.selectGroupAware);
  const toggleGroupAware = useStore((s) => s.toggleGroupAware);
  const openSymbolContextMenu = useStore((s) => s.openSymbolContextMenu);

  const tagDrag = useCanvasTagDrag(layer.id);

  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
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
  const [regionHovered, setRegionHovered] = React.useState(false);

  const handleRef = React.useCallback(
    (node: Konva.Image | null) => {
      imageRef.current = node;
      onMount(layer.id, node);
    },
    [layer.id, onMount],
  );

  const handleRegionGroupRef = React.useCallback(
    (node: Konva.Group | null) => {
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
        return;
      }
      if (e.evt.altKey) {
        // Alt-click: if multiple symbols are stacked under the cursor, cycle
        // to the next one in z-order so any region in a pile is reachable.
        // Falls through to single-symbol select (bypassing group expansion)
        // when nothing else is stacked here.
        const stage = e.target.getStage();
        const pointer = stage?.getRelativePointerPosition();
        const state = useStore.getState();
        const cid = state.currentPicmonicId;
        const all = cid ? (state.picmonics[cid]?.canvas.symbols ?? []) : [];
        if (pointer && all.length > 1) {
          const hits = all
            .filter(
              (s) =>
                pointer.x >= s.x &&
                pointer.x <= s.x + s.width &&
                pointer.y >= s.y &&
                pointer.y <= s.y + s.height,
            )
            .sort((a, b) => b.layerIndex - a.layerIndex);
          if (hits.length > 1) {
            const curId = state.selectedSymbolIds[0];
            const curIdx = hits.findIndex((h) => h.id === curId);
            const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % hits.length;
            setSelectedSymbolIds([hits[nextIdx].id]);
            return;
          }
        }
        setSelectedSymbolIds([layer.id]);
        return;
      }
      selectGroupAware(layer.id);
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

  // Region marker: a SymbolLayer whose `ref` starts with `region:` renders as
  // a Konva.Group (the click/drag/transform target) containing:
  //   - a faint outline Rect that brightens on hover/select/glow
  //   - a small numbered chip in the top-left so the marker is discoverable
  //     without making the painting underneath unreadable
  if (layer.ref.startsWith(REGION_REF_PREFIX)) {
    const showRegionGlow = glowing && !selected;
    const active = selected || glowing;
    const outlineStroke = active
      ? accent
      : regionHovered
        ? accent
        : placeholderFillWeak;
    const outlineWidth = active ? 4 : regionHovered ? 2 : 1;
    // Chip styling: the chip is the always-visible badge. It's small and
    // dim by default, accent-filled when active, slightly brighter on hover.
    const chipFill = active
      ? accent
      : regionHovered
        ? `color-mix(in oklch, ${accent} 70%, transparent)`
        : `color-mix(in oklch, ${accent} 28%, transparent)`;
    const chipStroke = active
      ? accent
      : `color-mix(in oklch, ${accent} 45%, transparent)`;
    const chipTextColor = active
      ? "var(--accent-foreground, oklch(0.15 0 0))"
      : "var(--background, oklch(0.98 0 0))";
    const handleRegionMouseEnter = (e: KonvaEventObject<MouseEvent>) => {
      setRegionHovered(true);
      handleMouseEnter(e);
    };
    const handleRegionMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
      setRegionHovered(false);
      handleMouseLeave(e);
    };
    return (
      <Group
        ref={handleRegionGroupRef}
        id={layer.id}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation}
        opacity={dimFactor}
        draggable={interactive}
        listening={interactive}
        onClick={interactive ? handleClick : undefined}
        onContextMenu={interactive ? handleContextMenu : undefined}
        onMouseEnter={interactive ? handleRegionMouseEnter : undefined}
        onMouseLeave={interactive ? handleRegionMouseLeave : undefined}
        onDragStart={interactive ? tagDrag.onDragStart : undefined}
        onDragEnd={interactive ? tagDrag.onDragEnd : undefined}
      >
        <Rect
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          stroke={outlineStroke}
          strokeWidth={outlineWidth}
          cornerRadius={4}
          listening={false}
          perfectDrawEnabled={showRegionGlow}
          shadowEnabled={showRegionGlow}
          shadowColor={accent}
          shadowBlur={28}
          shadowOpacity={showRegionGlow ? 1 : 0}
          shadowOffsetX={0}
          shadowOffsetY={0}
        />
        {regionOrdinal != null && (
          <>
            <Rect
              x={BADGE_MARGIN}
              y={BADGE_MARGIN}
              width={BADGE_W}
              height={BADGE_H}
              fill={chipFill}
              stroke={chipStroke}
              strokeWidth={1}
              cornerRadius={3}
              listening={false}
              perfectDrawEnabled={false}
              opacity={active ? 1 : regionHovered ? 0.95 : 0.85}
            />
            <Text
              x={BADGE_MARGIN}
              y={BADGE_MARGIN}
              width={BADGE_W}
              height={BADGE_H}
              text={String(regionOrdinal)}
              fontSize={10}
              fontStyle="600"
              fill={chipTextColor}
              align="center"
              verticalAlign="middle"
              listening={false}
              perfectDrawEnabled={false}
            />
          </>
        )}
      </Group>
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
