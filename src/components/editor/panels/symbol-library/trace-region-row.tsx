"use client";

import * as React from "react";
import { PencilIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Compact row that toggles the canvas into lasso mode. Only mounted by
 * AddRow when a backdrop is set — region symbols are traces of backdrop
 * pixels, so they only make sense once there's something to trace.
 *
 * Click while idle → enter lasso mode (canvas cursor → crosshair, marquee
 * disabled, backdrop becomes pointer-listening). Click again or press Esc
 * to return to select.
 */
export function TraceRegionRow() {
  const canvasTool = useStore((s) => s.ui.canvasTool);
  const setCanvasTool = useStore((s) => s.setCanvasTool);
  const setRetraceTargetId = useStore((s) => s.setRetraceTargetId);
  const isActive = canvasTool === "lasso";

  const handleClick = React.useCallback(() => {
    if (isActive) {
      setRetraceTargetId(null);
      setCanvasTool("select");
      return;
    }
    setCanvasTool("lasso");
  }, [isActive, setCanvasTool, setRetraceTargetId]);

  return (
    <div className="border-b border-border bg-card/60 px-3 py-2.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={handleClick}
              aria-pressed={isActive}
              aria-label="Trace region on background"
              className={cn(
                "group flex h-10 w-full items-center justify-center gap-1.5 rounded-md",
                "border border-dashed transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent)]/[0.10] text-foreground"
                  : "border-border/80 bg-card/30 text-muted-foreground hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/[0.04] hover:text-foreground",
              )}
            />
          }
        >
          <PencilIcon
            className={cn(
              "size-3.5 transition-transform",
              !isActive && "group-hover:scale-110",
            )}
          />
          <span className="text-[11px] font-medium">
            {isActive ? "Tracing… (Esc to cancel)" : "Trace region"}
          </span>
          {!isActive && (
            <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50">
              · Lasso on background
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          Freehand-trace an object in the background to create a region symbol
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
