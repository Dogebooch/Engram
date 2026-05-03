"use client";

import * as React from "react";
import { CircleHelpIcon, PanelLeftIcon, PanelRightIcon, PlayIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, useUiPrefs } from "@/lib/store/hooks";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { flushIndexPersist } from "@/lib/store/index-store";
import { EditMenu } from "./edit-menu";
import { EditorExportMenu } from "./editor-export-menu";
import { FileMenu } from "./file-menu";
import { PicmonicName } from "./picmonic-name";
import { SaveStatus } from "./save-status";
import { ThemeToggle } from "./theme-toggle";

export function Topbar() {
  const ui = useUiPrefs();
  const currentId = useCurrentPicmonicId();
  const toggleLeft = useStore((s) => s.toggleLeftCollapsed);
  const toggleRight = useStore((s) => s.toggleRightCollapsed);
  const createPicmonic = useStore((s) => s.createPicmonic);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const enterPlayer = useStore((s) => s.enterPlayer);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

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
      {inEditor ? (
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
      ) : null}

      <Brand canGoHome={inEditor} onHome={() => void goHome()} />

      {inEditor ? (
        <>
          <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
          <FileMenu />
          <EditMenu />
          <div className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
          <PicmonicName />
        </>
      ) : (
        <span
          aria-hidden
          className="ml-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70"
        >
          library
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <QuotaBadge onJumpHome={() => void goHome()} />
        {inEditor ? (
          <>
            <SaveStatus />
            <EditorExportMenu />
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

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setHelpOpen(true)}
                aria-label="Keyboard shortcuts"
                className="text-muted-foreground/70"
              >
                <CircleHelpIcon />
              </Button>
            }
          />
          <TooltipContent>Shortcuts (?)</TooltipContent>
        </Tooltip>

        <ThemeToggle />

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
