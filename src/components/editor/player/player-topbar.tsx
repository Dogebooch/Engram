"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import type { PlayerMode } from "@/lib/store/slices/ui-slice";

interface PlayerTopbarProps {
  totalFacts: number;
  sequentialIndex: number;
}

export function PlayerTopbar({ totalFacts, sequentialIndex }: PlayerTopbarProps) {
  const picmonic = usePicmonic();
  const mode = useStore((s) => s.player.mode);
  const setPlayerMode = useStore((s) => s.setPlayerMode);
  const exitPlayer = useStore((s) => s.exitPlayer);

  const onSelect = (m: PlayerMode) => () => setPlayerMode(m);

  return (
    <header className="eng-player-topbar" role="banner">
      <span className="eng-player-topbar__title">
        <span className="eng-player-topbar__title-dot" aria-hidden />
        study
      </span>
      <span className="eng-player-topbar__divider" aria-hidden />
      <span className="eng-player-topbar__picmonic">
        {picmonic?.meta.name ?? "Untitled"}
      </span>

      <div className="ml-auto flex items-center gap-3">
        {mode === "sequential" && totalFacts > 0 && (
          <span className="eng-player-topbar__counter" aria-live="polite">
            fact {String(Math.min(sequentialIndex + 1, totalFacts)).padStart(2, "0")}{" "}
            / {String(totalFacts).padStart(2, "0")}
          </span>
        )}

        <div
          className="eng-player-mode-toggle"
          role="radiogroup"
          aria-label="Study display mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === "hotspot"}
            data-active={mode === "hotspot"}
            onClick={onSelect("hotspot")}
            className="eng-player-mode-toggle__option"
          >
            hotspot
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "sequential"}
            data-active={mode === "sequential"}
            onClick={onSelect("sequential")}
            className="eng-player-mode-toggle__option"
          >
            sequential
          </button>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                onClick={exitPlayer}
                aria-label="Exit study mode"
              >
                <XIcon />
                <span className="hidden md:inline">exit</span>
              </Button>
            }
          />
          <TooltipContent>Exit study mode</TooltipContent>
        </Tooltip>
        <span className="eng-player-topbar__exit-hint" aria-hidden>
          Esc
        </span>
      </div>
    </header>
  );
}
