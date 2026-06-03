"use client";

import * as React from "react";
import { SYMBOL_DRAG_MIME } from "@/lib/constants";
import { useStore } from "@/lib/store";
import type { SymbolEntry } from "@/lib/symbols";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LibraryCardProps {
  entry: SymbolEntry;
  size?: "default" | "small";
  onActivate: (entry: SymbolEntry) => void;
}

export const LibraryCard = React.memo(function LibraryCard({
  entry,
  size = "default",
  onActivate,
}: LibraryCardProps) {
  const handleDragStart = React.useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.dataTransfer.setData(SYMBOL_DRAG_MIME, entry.id);
      e.dataTransfer.setData("text/plain", entry.displayName);
      e.dataTransfer.effectAllowed = "copy";
      const target = e.currentTarget;
      const img = target.querySelector("img");
      if (img instanceof HTMLImageElement) {
        e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
      }
      // The library is a modal drawer whose full-screen backdrop would swallow
      // the drop. Close it on the next tick (after the drag image is captured)
      // so the symbol can land on the now-exposed canvas at the cursor; the
      // drag continues even though this card unmounts.
      setTimeout(() => useStore.getState().setLibraryDrawerOpen(false), 0);
    },
    [entry.id, entry.displayName],
  );

  const handleClick = React.useCallback(() => {
    onActivate(entry);
  }, [entry, onActivate]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(entry);
      }
    },
    [entry, onActivate],
  );

  const aliasPreview = entry.aliases.slice(0, 5).join(", ");
  const isSmall = size === "small";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            draggable
            onDragStart={handleDragStart}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            data-engram-library-card
            data-symbol-id={entry.id}
            className={cn(
              "group relative flex flex-col items-center justify-center rounded-md outline-none cursor-pointer",
              "border border-border/55 bg-card/40",
              "shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_5%,transparent)]",
              "transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out",
              "hover:border-border hover:bg-card/75",
              "hover:shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_8%,transparent),0_2px_8px_-2px_color-mix(in_oklch,var(--background)_80%,transparent)]",
              "focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30",
              "active:translate-y-px active:bg-muted/80 active:shadow-[inset_0_1px_2px_0_color-mix(in_oklch,var(--background)_80%,transparent)]",
              isSmall ? "h-12 w-12 p-1.5" : "h-[72px] w-full p-2",
            )}
            aria-label={`Add ${entry.displayName} to canvas`}
          />
        }
      >
        <span className={cn("relative", isSmall ? "size-9" : "size-12")}>
          <img
            src={entry.imageUrl}
            alt=""
            draggable={false}
            loading="lazy"
            className="pointer-events-none size-full select-none object-contain transition-transform duration-150 ease-out group-active:translate-y-px"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        <span className="block max-w-[24ch] text-center">
          <span className="block font-medium">{entry.displayName}</span>
          {aliasPreview && (
            <span className="mt-0.5 block text-[10px] opacity-70">
              {aliasPreview}
            </span>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
});
