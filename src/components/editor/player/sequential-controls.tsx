"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SequentialControlsProps {
  index: number; // 0-indexed
  total: number;
  onPrev: () => void;
  onNext: () => void;
  hasRail?: boolean;
}

export function SequentialControls({
  index,
  total,
  onPrev,
  onNext,
  hasRail = true,
}: SequentialControlsProps) {
  const atFirst = index <= 0;
  const atLast = index >= total - 1;

  return (
    <div
      className={`eng-player-controls ${hasRail ? "has-rail" : ""}`}
      role="group"
      aria-label="Step through facts"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="eng-player-controls__btn"
              onClick={onPrev}
              disabled={atFirst}
              aria-label="Previous fact"
            >
              <ChevronLeftIcon size={18} />
            </button>
          }
        />
        <TooltipContent>Previous (←)</TooltipContent>
      </Tooltip>
      <div className="eng-player-controls__counter" aria-live="polite">
        <span>{String(Math.min(index + 1, Math.max(total, 1))).padStart(2, "0")}</span>
        <span className="eng-player-controls__counter-sep">/</span>
        <span className="eng-player-controls__counter-total">
          {String(total).padStart(2, "0")}
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="eng-player-controls__btn"
              onClick={onNext}
              disabled={atLast}
              aria-label="Next fact"
            >
              <ChevronRightIcon size={18} />
            </button>
          }
        />
        <TooltipContent>Next (→)</TooltipContent>
      </Tooltip>
    </div>
  );
}
