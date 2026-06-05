"use client";

import * as React from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group } from "react-konva";
import { NumberBadge } from "@/components/editor/player/hotspot-circle";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";

const ACCENT_FALLBACK = "oklch(0.68 0.095 52)";
const STAGE_FALLBACK = "oklch(0.255 0.025 188)";
const ACCENT_FG_FALLBACK = "oklch(0.18 0.018 60)";

const RADIUS = 13;

export interface SymbolNumberCircleProps {
  symbolId: string;
  ordinal: number;
  x: number;
  y: number;
  onSelect: (symbolId: string) => void;
  onHoverChange: (symbolId: string, hovering: boolean) => void;
}

/**
 * A small numbered disc that stands in for a symbol's outline on the editor
 * canvas (its chronological fact number). Clicking selects the symbol and opens
 * its describe popover; hovering promotes the full outline (via the parent's
 * hovered-symbol glow). Non-draggable — position is derived from the symbol.
 */
export const SymbolNumberCircle = React.memo(function SymbolNumberCircle({
  symbolId,
  ordinal,
  x,
  y,
  onSelect,
  onHoverChange,
}: SymbolNumberCircleProps) {
  const [hover, setHover] = React.useState(false);

  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;
  const stageFill = useThemedCssVar("--stage", STAGE_FALLBACK) ?? STAGE_FALLBACK;
  const accentForeground =
    useThemedCssVar("--accent-foreground", ACCENT_FG_FALLBACK) ?? ACCENT_FG_FALLBACK;

  const handleMouseEnter = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "pointer";
      setHover(true);
      onHoverChange(symbolId, true);
    },
    [onHoverChange, symbolId],
  );

  const handleMouseLeave = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "";
      setHover(false);
      onHoverChange(symbolId, false);
    },
    [onHoverChange, symbolId],
  );

  const handleClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;
      e.cancelBubble = true;
      onSelect(symbolId);
    },
    [onSelect, symbolId],
  );

  return (
    <Group
      name="export-chrome"
      x={x}
      y={y}
      scaleX={hover ? 1.08 : 1}
      scaleY={hover ? 1.08 : 1}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <NumberBadge
        ordinal={ordinal}
        accent={accent}
        stageFill={stageFill}
        accentForeground={accentForeground}
        radius={RADIUS}
        hover={hover}
      />
    </Group>
  );
});
