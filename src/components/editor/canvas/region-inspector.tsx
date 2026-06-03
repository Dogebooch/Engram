"use client";

import * as React from "react";
import { PencilLineIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useStore } from "@/lib/store";
import { polygonBBox } from "@/lib/canvas/polygon-centroid";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SymbolLayer } from "@/lib/types/canvas";

interface RegionInspectorProps {
  region: SymbolLayer;
  /** Bounding box (in pixels) of the canvas paper element on screen. */
  paperBox: {
    offsetX: number;
    offsetY: number;
    scale: number;
    width: number;
    height: number;
  };
  /** Width of the paper-host container, used for clamping. */
  containerSize: { width: number; height: number };
}

const CHIP_OFFSET = 14;
const CHIP_HEIGHT_GUESS = 36;
const CHIP_WIDTH_GUESS = 220;
const EMPTY_POLY: readonly { x: number; y: number }[] = [];

/**
 * Floating action chip pinned to the upper-right of a selected region.
 * Three actions, mono-labeled, accent-bordered: edit vertices, re-trace,
 * delete. Smart-flips to the lower-left if it'd otherwise clip the viewport.
 *
 * Positioned in CONTAINER (screen) coordinates, not stage coordinates, so
 * the chip never scales with zoom — actions remain reliably tap-sized.
 */
export function RegionInspector({
  region,
  paperBox,
  containerSize,
}: RegionInspectorProps) {
  const setRegionEditingId = useStore((s) => s.setRegionEditingId);
  const setCanvasTool = useStore((s) => s.setCanvasTool);
  const setRetraceTargetId = useStore((s) => s.setRetraceTargetId);
  const deleteSymbols = useStore((s) => s.deleteSymbols);
  const editing = useStore((s) => s.ui.regionEditingId === region.id);
  const polygon = React.useMemo(() => region.polygon ?? EMPTY_POLY, [region.polygon]);
  const vertexCount = polygon.length;

  const anchor = React.useMemo(() => {
    if (polygon.length === 0) return null;
    const bbox = polygonBBox(polygon);
    // Pin chip to the top-right corner of the bbox in stage coords, then
    // map into screen coords via paperBox.
    const sx = paperBox.offsetX + (bbox.x + bbox.width) * paperBox.scale;
    const sy = paperBox.offsetY + bbox.y * paperBox.scale;
    return { x: sx + CHIP_OFFSET, y: sy - CHIP_OFFSET - CHIP_HEIGHT_GUESS };
  }, [polygon, paperBox]);

  if (!anchor) return null;

  // Smart-flip: if the chip would push past the right edge, anchor it to
  // the bbox's left edge instead. If it'd go above the viewport, drop it
  // below the bbox.
  let { x, y } = anchor;
  if (x + CHIP_WIDTH_GUESS > containerSize.width - 8) {
    const bbox = polygonBBox(polygon);
    x = paperBox.offsetX + bbox.x * paperBox.scale - CHIP_OFFSET - CHIP_WIDTH_GUESS;
  }
  if (y < 8) {
    const bbox = polygonBBox(polygon);
    y = paperBox.offsetY + (bbox.y + bbox.height) * paperBox.scale + CHIP_OFFSET;
  }
  if (x < 8) x = 8;
  if (x + CHIP_WIDTH_GUESS > containerSize.width - 8)
    x = containerSize.width - 8 - CHIP_WIDTH_GUESS;

  const handleEdit = () => {
    setRegionEditingId(editing ? null : region.id);
  };
  const handleRetrace = () => {
    setRetraceTargetId(region.id);
    setCanvasTool("lasso");
  };
  const handleDelete = () => {
    deleteSymbols([region.id]);
  };

  return (
    <div
      role="toolbar"
      aria-label="Region actions"
      className={cn(
        "pointer-events-auto absolute z-30 flex items-center gap-0.5",
        "rounded-md border border-[var(--accent)]/40 bg-[oklch(0.13_0_0/0.92)]",
        "px-1.5 py-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm",
        "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
        // Subtle entrance — slides in from the polygon edge.
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=open]:slide-in-from-top-1",
      )}
      data-state="open"
      style={{ left: x, top: y }}
    >
      <span
        className="px-1.5 text-[9px] tracking-[0.18em] text-[var(--accent)]/85"
        aria-hidden
      >
        REGION
      </span>
      <span
        className="px-1 text-[9px] text-muted-foreground/60"
        aria-label={`${vertexCount} vertices`}
      >
        {vertexCount}v
      </span>
      <span className="mx-1 h-3.5 w-px bg-border/60" aria-hidden />

      <ChipButton
        onClick={handleEdit}
        active={editing}
        tooltip={editing ? "Stop editing vertices" : "Edit vertices"}
        ariaLabel="Edit vertices"
      >
        <PencilLineIcon className="size-3" />
        <span>{editing ? "Done" : "Edit"}</span>
      </ChipButton>

      <ChipButton
        onClick={handleRetrace}
        tooltip="Re-trace this region (replaces polygon, keeps the bullet)"
        ariaLabel="Re-trace region"
      >
        <RotateCcwIcon className="size-3" />
        <span>Re-trace</span>
      </ChipButton>

      <ChipButton
        onClick={handleDelete}
        tooltip="Delete region (also removes its bullet)"
        ariaLabel="Delete region"
        destructive
      >
        <Trash2Icon className="size-3" />
      </ChipButton>
    </div>
  );
}

interface ChipButtonProps {
  onClick: () => void;
  tooltip: string;
  ariaLabel: string;
  active?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}

function ChipButton({
  onClick,
  tooltip,
  ariaLabel,
  active,
  destructive,
  children,
}: ChipButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-1 transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/60",
              active
                ? "bg-[var(--accent)]/[0.16] text-foreground"
                : "hover:bg-white/[0.06] hover:text-foreground",
              destructive &&
                "hover:bg-destructive/[0.10] hover:text-destructive",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
