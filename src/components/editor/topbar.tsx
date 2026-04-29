"use client";

import { PanelLeftIcon, PanelRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, useUiPrefs } from "@/lib/store/hooks";
import { PicmonicName } from "./picmonic-name";
import { SaveStatus } from "./save-status";

export function Topbar() {
  const ui = useUiPrefs();
  const currentId = useCurrentPicmonicId();
  const toggleLeft = useStore((s) => s.toggleLeftCollapsed);
  const toggleRight = useStore((s) => s.toggleRightCollapsed);
  const createPicmonic = useStore((s) => s.createPicmonic);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);

  return (
    <header
      role="banner"
      className={cn(
        "relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3",
        "backdrop-blur supports-[backdrop-filter]:bg-card/30",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleLeft}
              aria-label={ui.leftCollapsed ? "Show library" : "Hide library"}
              aria-pressed={!ui.leftCollapsed}
              className={cn(ui.leftCollapsed && "text-muted-foreground/60")}
            >
              <PanelLeftIcon />
            </Button>
          }
        />
        <TooltipContent>{ui.leftCollapsed ? "Show library" : "Hide library"}</TooltipContent>
      </Tooltip>

      <Brand
        canGoHome={Boolean(currentId)}
        onHome={() => setCurrentPicmonic(null)}
      />

      <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />

      <PicmonicName />

      <div className="ml-auto flex items-center gap-2">
        <SaveStatus />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                onClick={() => createPicmonic()}
                aria-label="New Picmonic"
              >
                <PlusIcon />
                <span className="hidden md:inline">New</span>
              </Button>
            }
          />
          <TooltipContent>Create a new Picmonic</TooltipContent>
        </Tooltip>
        <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleRight}
                aria-label={ui.rightCollapsed ? "Show notes" : "Hide notes"}
                aria-pressed={!ui.rightCollapsed}
                className={cn(ui.rightCollapsed && "text-muted-foreground/60")}
              >
                <PanelRightIcon />
              </Button>
            }
          />
          <TooltipContent>{ui.rightCollapsed ? "Show notes" : "Hide notes"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function Brand({ canGoHome, onHome }: { canGoHome: boolean; onHome: () => void }) {
  const inner = (
    <>
      <span aria-hidden="true" className="relative inline-flex size-2.5 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-accent/30 blur-[3px]" />
        <span className="relative size-1.5 rounded-full bg-accent" />
      </span>
      <span className="font-mono text-[12px] font-medium tracking-[0.18em] text-foreground/85">
        engram
      </span>
    </>
  );

  if (!canGoHome) {
    return <div className="flex select-none items-center gap-2 px-1.5">{inner}</div>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onHome}
            aria-label="Back to home"
            className={cn(
              "flex select-none items-center gap-2 rounded-md px-1.5 py-1 -mx-0.5",
              "transition-colors hover:bg-muted/60",
              "focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
            )}
          />
        }
      >
        {inner}
      </TooltipTrigger>
      <TooltipContent>Back to home</TooltipContent>
    </Tooltip>
  );
}
