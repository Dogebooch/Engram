"use client";

import * as React from "react";
import { CheckIcon, ImageOffIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { useIndexStore } from "@/lib/store/index-store";
import { saveCurrentPicmonicNow } from "@/lib/store/save-now";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { parseNotes } from "@/lib/notes/parse";
import { UNASSIGNED_FACT_NAME } from "@/lib/notes/types";
import type { Picmonic } from "@/lib/types/picmonic";

interface ReviewExitDialogProps {
  open: boolean;
  picmonic: Picmonic | null;
  onKeepEditing: () => void;
  onAfterExit: () => void;
}

/**
 * Anki-style summary modal shown when a user navigates home from a
 * picmonic created or imported in the current session. One-glance
 * confirmation that what they made matches what they intended — no
 * silent loss of an in-progress import.
 *
 * Save and exit: flush pending writes, mark reviewed, navigate home.
 * Keep editing: dismiss; flag stays set so subsequent exits prompt again.
 * Discard: delete picmonic + assets, navigate home.
 */
export function ReviewExitDialog({
  open,
  picmonic,
  onKeepEditing,
  onAfterExit,
}: ReviewExitDialogProps) {
  const markSessionReviewed = useStore((s) => s.markSessionReviewed);
  const deletePicmonic = useStore((s) => s.deletePicmonic);
  const upsertIndexEntry = useIndexStore((s) => s.upsertIndexEntry);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const [busy, setBusy] = React.useState(false);

  const summary = React.useMemo(() => {
    if (!picmonic) return { symbols: 0, facts: 0, hasBackdrop: false };
    const parsed = parseNotes(picmonic.notes ?? "");
    let facts = 0;
    for (const f of parsed.factsById.values()) {
      if (f.name === UNASSIGNED_FACT_NAME) continue;
      if (f.symbolRefs.length === 0) continue;
      facts += 1;
    }
    return {
      symbols: picmonic.canvas.symbols.length,
      facts,
      hasBackdrop: Boolean(picmonic.canvas.backdrop?.uploadedBlobId),
    };
  }, [picmonic]);

  if (!picmonic) return null;

  const onSaveAndExit = async () => {
    setBusy(true);
    try {
      await flushPendingSave();
      await saveCurrentPicmonicNow();
      const latest = useStore.getState().picmonics[picmonic.id] ?? picmonic;
      upsertIndexEntry({
        id: latest.id,
        name: latest.meta.name,
        tags: latest.meta.tags ?? [],
        createdAt: latest.meta.createdAt,
        updatedAt: latest.meta.updatedAt,
        thumbDataUrl: null,
        symbolCount: latest.canvas.symbols.length,
        factCount: summary.facts,
      });
      markSessionReviewed(picmonic.id);
      setCurrentPicmonic(null);
    } finally {
      setBusy(false);
      onAfterExit();
    }
  };

  const onDiscard = async () => {
    setBusy(true);
    try {
      await deletePicmonic(picmonic.id);
      markSessionReviewed(picmonic.id);
      setCurrentPicmonic(null);
    } finally {
      setBusy(false);
      onAfterExit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onKeepEditing()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save “{picmonic.meta.name}”?</DialogTitle>
          <DialogDescription>
            A one-glance review before you go back to the library.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <SummaryRow
            label="Background"
            value={summary.hasBackdrop ? "set" : "not set"}
            ok={summary.hasBackdrop}
            warnIcon={<ImageOffIcon className="size-3.5" />}
          />
          <SummaryRow
            label="Outlines"
            value={summary.symbols === 1 ? "1 symbol" : `${summary.symbols} symbols`}
            ok={summary.symbols > 0}
          />
          <SummaryRow
            label="Tagged facts"
            value={summary.facts === 1 ? "1 fact" : `${summary.facts} facts`}
            ok={summary.facts > 0}
          />
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => void onDiscard()}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            <Trash2Icon />
            Discard
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onKeepEditing} disabled={busy}>
              Keep editing
            </Button>
            <Button onClick={() => void onSaveAndExit()} disabled={busy}>
              <CheckIcon />
              Save and exit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  label,
  value,
  ok,
  warnIcon,
}: {
  label: string;
  value: string;
  ok: boolean;
  warnIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        className={`flex items-center gap-1.5 text-sm ${
          ok ? "text-foreground" : "text-muted-foreground/80"
        }`}
      >
        {ok ? (
          <CheckIcon className="size-3.5 text-[var(--accent)]" />
        ) : (
          warnIcon ?? null
        )}
        {value}
      </span>
    </div>
  );
}
