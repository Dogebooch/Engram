"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, usePicmonic } from "@/lib/store/hooks";
import { getSymbolById } from "@/lib/symbols";
import { parseNotes } from "@/lib/notes/parse";
import type { ParsedNotes } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { BulletFields } from "@/components/editor/panels/notes-panel/bullet-fields";
import {
  computePopoverAnchor,
  type AnchorFitBox,
} from "./describe-popover-anchor";

const POPOVER_WIDTH = 360;
// Estimate used only to decide below/above placement; the rendered card sizes
// to its content. A region near the bottom edge flips above.
const POPOVER_EST_HEIGHT = 220;

/**
 * Canvas-anchored editor for a symbol/region's bullet: Description → Meaning →
 * Why. Writes through to the markdown bullet (markdown stays canonical); no
 * parallel state. Shown when exactly one bulleted symbol is selected AND the
 * `describePopover` store flag points at it — so Escape/✕ dismiss it without
 * dropping the selection, and re-selecting reopens it.
 */
export function DescribePopover({ box }: { box: AnchorFitBox }) {
  const picmonic = usePicmonic();
  const currentId = useCurrentPicmonicId();
  const setNotes = useStore((s) => s.setNotes);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);
  const selectedIds = useStore((s) => s.selectedSymbolIds);
  const describePopover = useStore((s) => s.describePopover);
  const openDescribePopover = useStore((s) => s.openDescribePopover);
  const closeDescribePopover = useStore((s) => s.closeDescribePopover);

  const notesView = useStore((s) => s.ui.notesView);

  const notes = picmonic?.notes ?? "";
  const parsed = React.useMemo(() => parseNotes(notes), [notes]);

  const id = selectedIds.length === 1 ? selectedIds[0] : null;

  // Auto-open on selection change to a single symbol; auto-dismiss when the
  // selection clears or becomes multi. Tracks the previous id so a manual
  // close (Escape/✕) for the same id doesn't immediately reopen.
  const prevId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (id === prevId.current) return;
    prevId.current = id;
    if (id) openDescribePopover(id);
    else closeDescribePopover();
  }, [id, openDescribePopover, closeDescribePopover]);

  const factIds = React.useMemo(
    () => (id ? (parsed.factsBySymbolId.get(id) ?? []) : []),
    [id, parsed],
  );

  const layer = React.useMemo(
    () => (id ? (picmonic?.canvas.symbols.find((s) => s.id === id) ?? null) : null),
    [id, picmonic],
  );

  if (!id || !layer || factIds.length === 0) return null;
  if (describePopover?.symbolId !== id) return null;
  if (box.scale <= 0) return null;
  // The Form view edits the bullet inline in its Fact card, so the canvas
  // popover would be a duplicate. It only serves the raw "source" view.
  if (notesView === "form") return null;

  const container = {
    width: box.width + box.offsetX * 2,
    height: box.height + box.offsetY * 2,
  };
  const anchor = computePopoverAnchor(
    { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
    box,
    container,
    { width: POPOVER_WIDTH, height: POPOVER_EST_HEIGHT },
  );

  return (
    <DescribePopoverInner
      key={id}
      symbolId={id}
      layerRef={layer.ref}
      factIds={factIds}
      parsed={parsed}
      notes={notes}
      currentId={currentId}
      setNotes={setNotes}
      setLastSyncSource={setLastSyncSource}
      close={closeDescribePopover}
      left={anchor.left}
      top={anchor.top}
    />
  );
}

interface InnerProps {
  symbolId: string;
  layerRef: string | null;
  factIds: string[];
  parsed: ParsedNotes;
  notes: string;
  currentId: string | null;
  setNotes: (id: string, notes: string) => void;
  setLastSyncSource: (src: "canvas" | "editor" | null) => void;
  close: () => void;
  left: number;
  top: number;
}

function DescribePopoverInner({
  symbolId,
  layerRef,
  factIds,
  parsed,
  notes,
  currentId,
  setNotes,
  setLastSyncSource,
  close,
  left,
  top,
}: InnerProps) {
  // Active Fact — defaults to first. Store the chosen factId but derive the
  // *effective* one each render so a stale id (rename, untag) is never used.
  const [chosenFactId, setChosenFactId] = React.useState<string>(factIds[0]);
  const activeFactId =
    chosenFactId &&
    parsed.factsById.has(chosenFactId) &&
    factIds.includes(chosenFactId)
      ? chosenFactId
      : factIds[0];

  const entry = layerRef ? getSymbolById(layerRef) : null;
  const displayName = entry?.displayName ?? (layerRef ? layerRef : "region");
  const imageUrl = entry?.imageUrl ?? null;

  // Esc dismisses the popover (selection stays). Writes are already saved.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const showSelector = factIds.length > 1;

  return (
    <div
      className="eng-describe-popover absolute z-40 flex w-[360px] flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-[0_12px_44px_-14px_color-mix(in_oklch,var(--background)_85%,transparent)] ring-1 ring-border"
      style={{ left, top }}
      data-eng-describe-popover
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Identity strip */}
      <div className="flex h-7 items-center gap-2 border-b border-border/50 px-3">
        {imageUrl ? (
          <span className="flex size-4 items-center justify-center overflow-hidden rounded-sm bg-foreground/[0.04]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="size-full object-contain"
              draggable={false}
            />
          </span>
        ) : (
          <span className="size-4 rounded-sm bg-foreground/[0.06]" />
        )}
        <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/85">
          {displayName}
        </span>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="ml-auto flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/85"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Fact selector — only when this symbol is tagged in multiple Facts */}
      {showSelector && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-2 py-1">
          {factIds.map((fid) => {
            const f = parsed.factsById.get(fid);
            if (!f) return null;
            const active = fid === activeFactId;
            return (
              <button
                key={fid}
                type="button"
                onClick={() => setChosenFactId(fid)}
                className={cn(
                  "flex h-[22px] max-w-full items-center truncate rounded-md border px-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
                  active
                    ? "border-foreground/20 bg-foreground/[0.08] text-foreground/95"
                    : "border-transparent text-muted-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground/80",
                )}
              >
                <span className="truncate">{f.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="py-0.5">
        <BulletFields
          symbolId={symbolId}
          factId={activeFactId}
          parsed={parsed}
          notes={notes}
          currentId={currentId}
          setNotes={setNotes}
          setLastSyncSource={setLastSyncSource}
          autoFocus
          onRequestClose={close}
        />
      </div>
    </div>
  );
}
