"use client";

import * as React from "react";
import { SYMBOL_DRAG_MIME } from "@/lib/constants";
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
              "group relative flex flex-col items-center justify-center rounded-md border border-transparent bg-background/40 outline-none transition-colors",
              "hover:border-border hover:bg-background/80",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
              "active:bg-background/60",
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
            className="pointer-events-none size-full select-none object-contain transition-transform group-hover:scale-110 group-active:scale-95"
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
