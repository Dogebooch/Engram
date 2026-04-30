"use client";

import * as React from "react";
import { toast } from "sonner";
import { get as idbGet } from "idb-keyval";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { picmonicKey } from "@/lib/constants";
import { useStore } from "@/lib/store";
import {
  exportAnkiCsv,
  exportBundle,
  exportMarkdown,
} from "@/lib/export";
import type { Picmonic } from "@/lib/types/picmonic";

interface HomeExportDialogProps {
  picmonicId: string | null;
  picmonicName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Home-view export dialog. Picks Markdown / Anki CSV / Bundle (.zip).
 * PNG export is only offered from the editor (live stage) — pushed back
 * for ship-readiness; users open a scene to export it as an image.
 */
export function HomeExportDialog({
  picmonicId,
  picmonicName,
  open,
  onOpenChange,
}: HomeExportDialogProps) {
  const memoryPicmonic = useStore((s) =>
    picmonicId ? s.picmonics[picmonicId] : undefined,
  );
  const [busy, setBusy] = React.useState(false);

  const fetchPicmonic = async (): Promise<Picmonic | null> => {
    if (memoryPicmonic) return memoryPicmonic;
    if (!picmonicId) return null;
    try {
      const data = await idbGet<Picmonic>(picmonicKey(picmonicId));
      return data ?? null;
    } catch {
      return null;
    }
  };

  const run = async (
    fn: (p: Picmonic) => Promise<void> | void,
    label: string,
  ) => {
    setBusy(true);
    try {
      const p = await fetchPicmonic();
      if (!p) {
        toast.error("Could not load Picmonic");
        return;
      }
      await fn(p);
      toast(`Exported ${label}`, { duration: 1400 });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Export
          </DialogTitle>
          <DialogDescription>
            Pick a format for <span className="text-foreground">{picmonicName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Row
            kbd="MD"
            title="Markdown"
            sub="notes.md — drop into Obsidian"
            disabled={busy}
            onClick={() => run((p) => exportMarkdown(p), "Markdown")}
          />
          <Row
            kbd="CSV"
            title="Anki CSV"
            sub="one row per Fact"
            disabled={busy}
            onClick={() => run((p) => exportAnkiCsv(p), "Anki CSV")}
          />
          <Row
            kbd="ZIP"
            title="Bundle"
            sub="notes + canvas + meta · re-importable later"
            disabled={busy}
            onClick={() => run((p) => exportBundle(null, p), "Bundle")}
          />
          <p className="mt-1 px-1 text-[11px] leading-relaxed text-muted-foreground/80">
            PNG export is available in the editor — open a scene to capture it as an image.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  kbd,
  title,
  sub,
  onClick,
  disabled,
}: {
  kbd: string;
  title: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2.5 text-left transition-colors hover:border-foreground/30 hover:bg-card/70 disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="inline-flex w-12 justify-center rounded border border-border/70 bg-background/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-foreground">
        {kbd}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}
