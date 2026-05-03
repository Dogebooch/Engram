"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/store";

/**
 * Confirmation dialog for deleting one or more canvas symbols. Mounted at the
 * editor-shell level. Reads its open/close state from
 * `interactions-slice.pendingSymbolDelete` and respects the persisted
 * `ui.confirmSymbolDelete` toggle (set to false via the "Don't ask again"
 * checkbox).
 */
export function SymbolDeleteConfirm() {
  const pending = useStore((s) => s.pendingSymbolDelete);
  const cancel = useStore((s) => s.cancelSymbolDelete);
  const confirmPending = useStore((s) => s.confirmPendingSymbolDelete);

  const [dontAskAgain, setDontAskAgain] = React.useState(false);

  React.useEffect(() => {
    if (pending) setDontAskAgain(false);
  }, [pending]);

  const open = pending !== null;
  const count = pending?.ids.length ?? 0;
  const scrubReferences = pending?.scrubReferences ?? false;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) cancel();
    },
    [cancel],
  );

  const handleConfirm = React.useCallback(() => {
    confirmPending({ dontAskAgain });
  }, [confirmPending, dontAskAgain]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === "Enter" && open) {
            e.preventDefault();
            handleConfirm();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {count > 1 ? `Delete ${count} symbols?` : "Delete this symbol?"}
          </DialogTitle>
          <DialogDescription>
            {scrubReferences
              ? count > 1
                ? "Their canvas layers AND every reference in your notes will be removed."
                : "Its canvas layer AND every reference in your notes will be removed."
              : count > 1
                ? "Their canvas layers will be removed. Any references in your notes will render as [missing] chips so you can decide what to do with them."
                : "Its canvas layer will be removed. Any reference in your notes will render as a [missing] chip so you can decide what to do with it."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between sm:items-center">
          <label className="flex select-none items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75 hover:text-foreground/85 transition-colors cursor-pointer">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            Don&apos;t ask again
          </label>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              Delete
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
