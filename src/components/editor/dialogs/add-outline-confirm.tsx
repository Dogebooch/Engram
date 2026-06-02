"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { describeSymbol } from "@/lib/canvas/missing-outlines";
import { parseNotes } from "@/lib/notes/parse";
import { useStore } from "@/lib/store";

/**
 * "Add an outline?" confirm shown when a symbol bullet's chip is clicked but
 * the symbol has no traced outline yet. With a background image present it
 * drops straight into drawing; without one it routes through a background
 * picker first (the canvas auto-resumes the draw once the image lands).
 */
export function AddOutlineConfirm() {
  const symbolId = useStore((s) => s.outlineConfirmSymbolId);
  const dismiss = useStore((s) => s.dismissOutlineConfirm);
  const hasBackdrop = useStore((s) => {
    const cid = s.currentPicmonicId;
    return cid ? !!s.picmonics[cid]?.canvas.backdrop?.uploadedBlobId : false;
  });
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const open = symbolId != null;
  const description = React.useMemo(() => {
    if (!symbolId) return null;
    const st = useStore.getState();
    const cid = st.currentPicmonicId;
    const notes = cid ? (st.picmonics[cid]?.notes ?? "") : "";
    return describeSymbol(notes, parseNotes(notes), symbolId);
  }, [symbolId]);
  const label = description ?? "this symbol";

  const handleDraw = () => {
    if (!symbolId) return;
    useStore.getState().startOutlineForSymbol(symbolId);
    dismiss();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !symbolId) return;
    const s = useStore.getState();
    s.setOutlineTarget(symbolId);
    dismiss();
    const result = await s.setBackdropFromUpload(file);
    if (result.kind !== "ok") {
      s.setOutlineTarget(null);
      toast("Couldn't set that background", { duration: 1800 });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an outline?</DialogTitle>
          <DialogDescription>
            {hasBackdrop
              ? `Draw a highlight over "${label}" on the background image.`
              : `Outlines are drawn over a background image. Choose one to start outlining "${label}".`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            Cancel
          </Button>
          {hasBackdrop ? (
            <Button onClick={handleDraw}>Draw outline</Button>
          ) : (
            <Button onClick={() => fileInputRef.current?.click()}>
              Choose background…
            </Button>
          )}
        </DialogFooter>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFile}
        />
      </DialogContent>
    </Dialog>
  );
}
