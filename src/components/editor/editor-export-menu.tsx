"use client";

import * as React from "react";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import {
  exportAnkiCsv,
  exportBundle,
  exportMarkdown,
  exportPng,
} from "@/lib/export";
import { useCurrentStage } from "./canvas/canvas-stage-ref";

export function EditorExportMenu() {
  const currentId = useCurrentPicmonicId();
  const stage = useCurrentStage();
  const [busy, setBusy] = React.useState(false);

  const getPicmonic = () => {
    const s = useStore.getState();
    return currentId ? s.picmonics[currentId] : undefined;
  };

  const wrap = async (fn: () => Promise<void> | void, label: string) => {
    setBusy(true);
    try {
      await fn();
      toast(`Exported ${label}`, { duration: 1400 });
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const onPng = () => {
    const p = getPicmonic();
    if (!p || !stage) {
      toast.error("Canvas not ready");
      return;
    }
    void wrap(() => exportPng(stage, p), "PNG");
  };

  const onMarkdown = () => {
    const p = getPicmonic();
    if (!p) return;
    void wrap(() => exportMarkdown(p), "Markdown");
  };

  const onAnki = () => {
    const p = getPicmonic();
    if (!p) return;
    void wrap(() => exportAnkiCsv(p), "Anki CSV");
  };

  const onBundle = () => {
    const p = getPicmonic();
    if (!p) return;
    void wrap(() => exportBundle(stage, p), "Bundle");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!currentId || busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4"
        aria-label="Export"
      >
        <DownloadIcon />
        <span className="hidden md:inline">Export</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Export
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={onPng} disabled={!stage}>
          PNG
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            2× scene
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
