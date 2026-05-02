"use client";

import { DownloadIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExportActions } from "./use-export-actions";

export function EditorExportMenu() {
  const {
    onPng,
    onMarkdown,
    onAnki,
    onBundle,
    busy,
    hasStage,
    hasPicmonic,
  } = useExportActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!hasPicmonic || busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4"
        aria-label="Export"
      >
        <DownloadIcon />
        <span className="hidden md:inline">Export</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Export
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem onClick={onPng} disabled={!hasStage}>
          PNG
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            2× · clean
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMarkdown}>
          Markdown
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            notes.md
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAnki}>
          Anki CSV
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            per-Fact
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onBundle}>
          Bundle (.zip)
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            all
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
