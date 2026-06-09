"use client";

import * as React from "react";
import { PanelRightIcon, PlayIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, useUiPrefs } from "@/lib/store/hooks";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { flushIndexPersist } from "@/lib/store/index-store";
import { AppMenu } from "./app-menu";
import { EditMenu } from "./edit-menu";
import { FileMenu } from "./file-menu";
import { PicmonicName } from "./picmonic-name";
import { SaveStatus } from "./save-status";

export function Topbar() {
  const ui = useUiPrefs();
  const currentId = useCurrentPicmonicId();
  const toggleRight = useStore((s) => s.toggleRightCollapsed);
  const createPicmonic = useStore((s) => s.createPicmonic);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const enterPlayer = useStore((s) => s.enterPlayer);

  const inEditor = Boolean(currentId);

  // Flush any debounce-pending save (canvas/notes 500ms, index 250ms) before
  // dropping the active picmonic. Without this, edits made within the debounce
  // window are silently lost when the brand button or quota badge sends the
  // user home.
  const goHome = React.useCallback(async () => {
    await Promise.all([flushPendingSave(), flushIndexPersist()]);
    setCurrentPicmonic(null);
  }, [setCurrentPicmonic]);

  return (
    <header
      role="banner"
      className={cn(
        "relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3",
        "backdrop-blur supports-[backdrop-filter]:bg-card/30",
      )}
    >
      <Brand canGoHome={inEditor} onHome={() => void goHome()} />

      {inEditor ? (
        <>
          <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
          <FileMenu />
          <EditMenu />
          <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
          <PicmonicName />
        </>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <QuotaBadge onJumpHome={() => void goHome()} />
        {inEditor ? (
          <>
            <SaveStatus />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={enterPlayer}
                    disabled={!currentId}
                    aria-label="Study mode"
                  >
                    <PlayIcon />
                    <span className="hidden md:inline">Study</span>
                  </Button>
                }
              />
              <TooltipContent>Study mode (M)</TooltipContent>
            </Tooltip>
            <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
          </>
        ) : null}

        <AppMenu />

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

        {inEditor ? (
          <>
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
          </>
        ) : null}
      </div>
    </header>
  );
}

function Brand({ canGoHome, onHome }: { canGoHome: boolean; onHome: () => void }) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="relative inline-flex size-8 items-center justify-center rounded-lg border border-border/70 bg-background/70 shadow-sm"
      >
        <span className="absolute size-3 rounded-full bg-accent/20 blur-[4px]" />
        <span className="relative size-2 rounded-full bg-accent" />
      </span>
    </>
  );

  if (!canGoHome) {
    return (
      <div className="flex select-none items-center gap-2">
        {inner}
        <span
          aria-hidden
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70"
        >
          library
        </span>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onHome}
            aria-label="Back to library"
            className={cn(
              "flex size-8 select-none items-center justify-center rounded-lg",
              "transition-colors hover:bg-muted/60",
              "focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
            )}
          />
        }
      >
        {inner}
      </TooltipTrigger>
      <TooltipContent>Library</TooltipContent>
    </Tooltip>
  );
}

function QuotaBadge({ onJumpHome }: { onJumpHome: () => void }) {
  const percent = useStore((s) => s.ui.storageQuota.percent);
  if (percent == null || percent < 95) return null;
  const rounded = Math.min(99, Math.round(percent));
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onJumpHome}
            aria-label="Storage almost full — jump to home"
            className={cn(
              "inline-flex h-6 items-center rounded-md px-2 -mr-0.5",
              "border border-destructive/55 bg-destructive/10 text-destructive",
              "font-mono text-[10px] uppercase tracking-[0.18em]",
              "transition-colors hover:bg-destructive/20",
            )}
          >
            {rounded}%
          </button>
        }
      />
      <TooltipContent>Storage {rounded}% full · click to free space</TooltipContent>
    </Tooltip>
  );
}
