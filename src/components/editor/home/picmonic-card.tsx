"use client";

import * as React from "react";
import { MoreHorizontalIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PicmonicIndexEntry } from "@/lib/types/index-entry";
import { initials, relativeTime } from "./format";

interface PicmonicCardProps {
  entry: PicmonicIndexEntry;
  now: number;
  onOpen: () => void;
  onRename: () => void;
  onEditTags: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
  selectedTags: ReadonlySet<string>;
}

export function PicmonicCard({
  entry,
  now,
  onOpen,
  onRename,
  onEditTags,
  onDuplicate,
  onExport,
  onDelete,
  onTagClick,
  selectedTags,
}: PicmonicCardProps) {
  const visibleTags = entry.tags.slice(0, 3);
  const hiddenTagCount = Math.max(0, entry.tags.length - visibleTags.length);

  return (
    <div className="group relative flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "block w-full overflow-hidden rounded-lg border border-border/60 bg-card/40 text-left",
          "transition-[border-color,transform,box-shadow] duration-150 ease-out",
          "hover:border-foreground/30 hover:-translate-y-px hover:shadow-[0_12px_30px_-20px_rgba(0,0,0,0.8)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        )}
      >
        <div
          className="relative aspect-[16/9] w-full overflow-hidden bg-stage"
          style={
            entry.thumbDataUrl
              ? undefined
              : {
                  backgroundImage:
                    "radial-gradient(ellipse at center, oklch(0.13 0 0) 0%, oklch(0.105 0 0) 70%)",
                }
          }
        >
          {entry.thumbDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.thumbDataUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-3xl font-medium tracking-[0.05em] text-muted-foreground/40">
              {initials(entry.name)}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              picmonic
            </span>
          </div>
          <h3 className="truncate text-sm font-medium text-foreground" title={entry.name}>
            {entry.name}
          </h3>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-tight text-muted-foreground">
            <span>
              {entry.symbolCount} {entry.symbolCount === 1 ? "sym" : "syms"}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>
              {entry.factCount} {entry.factCount === 1 ? "fact" : "facts"}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>{relativeTime(now, entry.updatedAt)}</span>
          </div>
        </div>
      </button>

      {visibleTags.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 px-3 pb-1">
          {visibleTags.map((t) => {
            const selected = selectedTags.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(t);
                }}
                className={cn(
                  "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
                  selected
                    ? "bg-accent/20 text-accent-foreground/90 ring-1 ring-accent/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t}
              </button>
            );
          })}
          {hiddenTagCount > 0 && (
            <span className="font-mono text-[10px] tracking-tight text-muted-foreground/60">
              +{hiddenTagCount}
            </span>
          )}
        </div>
      )}

      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="More actions"
                className="inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-card/80 text-muted-foreground backdrop-blur-sm transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <MoreHorizontalIcon className="size-3.5" />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>Open</DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onEditTags}>Edit tags…</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExport}>Export…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
