"use client";

import * as React from "react";
import { SparklesIcon } from "lucide-react";
import { USER_ASSET_ACCEPT } from "@/lib/constants";
import { uploadUserAssets } from "@/lib/user-assets";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { autoPlaceUploadIntoArmedFact } from "./auto-place-upload";
import { reportUploadResult } from "./upload-result-toasts";

interface AddSymbolCardProps {
  /**
   * `compact` (default) — square-ish dashed card sized to sit in a grid cell
   * alongside the BackdropCard's empty state.
   * `row` — full-width single-row dashed card; used below an active backdrop.
   */
  variant?: "compact" | "row";
}

export function AddSymbolCard({ variant = "compact" }: AddSymbolCardProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleClick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      e.target.value = "";
      setBusy(true);
      try {
        const result = await uploadUserAssets(files);
        reportUploadResult(result);
        autoPlaceUploadIntoArmedFact(result);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const isRow = variant === "row";

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={handleClick}
              disabled={busy}
              aria-label="Add symbol"
              className={cn(
                "group flex w-full items-center justify-center gap-1.5",
                "rounded-md border border-dashed border-border/80",
                "bg-card/30 text-muted-foreground transition-all",
                "hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/[0.04] hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
                "disabled:opacity-50",
                isRow
                  ? "h-10 flex-row px-3"
                  : "aspect-video flex-col",
              )}
            />
          }
        >
          {isRow ? (
            <>
              <SparklesIcon className="size-3.5 transition-transform group-hover:scale-110" />
              <span className="text-[11px] font-medium">Add symbol</span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50">
                · Or drop in library
              </span>
            </>
          ) : (
            <>
              <SparklesIcon className="size-4 transition-transform group-hover:scale-110" />
              <span className="text-[11px] font-medium">Add symbol</span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50">
                Or drop in library
              </span>
            </>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          Upload one or more symbols
        </TooltipContent>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        accept={USER_ASSET_ACCEPT}
        multiple
        onChange={handleChange}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
    </>
  );
}
