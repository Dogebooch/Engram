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
  onMove: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export function PicmonicCard({
  entry,
  now,
  onOpen,
  onRename,
  onMove,
  onDuplicate,
  onExport,
  onDelete,
}: PicmonicCardProps) {
  const thumbDataUrl =
    entry.symbolCount > 0 || entry.factCount > 0 ? entry.thumbDataUrl : null;
  const sourceLabel = entry.sourceVideo?.source ?? entry.sourceVideo?.course ?? null;

  return (
    <div className="group relative flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "block w-full overflow-hidden rounded-lg border border-border/60 bg-card/40 text-left",
          "transition-[border-color,transform,box-shadow] duration-150 ease-out",
          "hover:border-foreground/30 hover:-translate-y-px hover:shadow-[0_12px_30px_-20px_color-mix(in_oklch,var(--background)_85%,transparent)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        )}
      >
        <div
          className="relative aspect-[16/9] w-full overflow-hidden bg-stage"
          style={
            thumbDataUrl
              ? undefined
              : {
                  backgroundImage:
                    "radial-gradient(ellipse at center, var(--stage-vignette-inner) 0%, var(--stage-vignette-outer) 70%)",
                }
          }
        >
          {thumbDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbDataUrl}
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
            {entry.sourceVideo ? (
              <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-accent-foreground/80">
                {entry.sourceVideo.confidence === "probable" ? "possible import" : sourceLabel ?? "imported"}
              </span>
            ) : null}
          </div>
          <h3 className="truncate text-sm font-medium text-foreground" title={entry.name}>
            {entry.name}
          </h3>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
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
            <DropdownMenuItem onClick={onMove}>Move to folder…</DropdownMenuItem>
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
