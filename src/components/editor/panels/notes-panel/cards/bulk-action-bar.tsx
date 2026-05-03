"use client";

import * as React from "react";
import { ReplaceIcon, Trash2Icon, XIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { untagSymbolFromFact } from "@/lib/notes/insert";
import type { ParsedSymbolRef } from "@/lib/notes/types";

/**
 * Floating bulk-action bar that appears when 2+ symbol rows are selected.
 *
 * Untag — strips every bullet referencing each selected uuid; right-to-left
 * so offsets stay valid; one `setNotes` call so undo collapses to one step.
 *
 * Retag — opens the existing FactPicker with all selected ids; the picker
 * routes through `insertSymbolBullet` for each.
 *
 * Delete — uses the existing delete-confirm flow with `scrubReferences:true`
 * so the canvas layers AND every notes ref are dropped together.
 */
export function BulkActionBar() {
  const selectedSymbolIds = useStore((s) => s.selectedSymbolIds);
  const count = selectedSymbolIds.length;

  if (count < 2) return null;

  const onUntag = () => {
    const s = useStore.getState();
    const cid = s.currentPicmonicId;
    if (!cid) return;
    const picmonic = s.picmonics[cid];
    if (!picmonic) return;
    const ids = new Set(selectedSymbolIds);
    const parsed = parseNotes(picmonic.notes);
    // Collect every (ref) for the selected ids in document order, then
    // process right-to-left so prior offsets stay stable across mutations.
    const refs: ParsedSymbolRef[] = [];
    for (const fact of parsed.factsById.values()) {
      for (const r of fact.symbolRefs) {
        if (ids.has(r.symbolId)) refs.push(r);
      }
    }
    refs.sort((a, b) => b.start - a.start);
    let next = picmonic.notes;
    for (const r of refs) next = untagSymbolFromFact(next, r);
    if (next !== picmonic.notes) s.setNotes(cid, next);
    s.clearSelection();
  };

  const onRetag = () => {
    const s = useStore.getState();
    s.openFactPicker(selectedSymbolIds);
  };

  const onDelete = () => {
    const s = useStore.getState();
    if (s.ui.confirmSymbolDelete) {
      s.requestSymbolDelete(selectedSymbolIds, { scrubReferences: true });
    } else {
      // No confirmation needed; do it directly.
      const cid = s.currentPicmonicId;
      const picmonic = cid ? s.picmonics[cid] : null;
      if (cid && picmonic) {
        // Reuse the same path as scrubReferences via the slice action.
        s.requestSymbolDelete(selectedSymbolIds, { scrubReferences: true });
        s.confirmPendingSymbolDelete();
      }
    }
  };

  const onClear = () => useStore.getState().clearSelection();

  return (
    <div className="eng-notes-bulkbar" role="toolbar" aria-label="Bulk actions">
      <span className="eng-notes-bulkbar__count">
        <strong>{count}</strong> selected
      </span>
      <button
        type="button"
        className="eng-notes-bulkbar__btn"
        onClick={onUntag}
      >
        <XIcon className="size-3.5" aria-hidden />
        Untag
      </button>
      <button
        type="button"
        className="eng-notes-bulkbar__btn"
        onClick={onRetag}
      >
        <ReplaceIcon className="size-3.5" aria-hidden />
        Retag
      </button>
      <button
        type="button"
        className="eng-notes-bulkbar__btn eng-notes-bulkbar__btn--destructive"
        onClick={onDelete}
      >
        <Trash2Icon className="size-3.5" aria-hidden />
        Delete
      </button>
      <button
        type="button"
        className="eng-notes-bulkbar__close"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
