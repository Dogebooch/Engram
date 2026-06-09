"use client";

import * as React from "react";
import { GripVertical, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { getSymbolById } from "@/lib/symbols";
import { isImageSymbolLayer, type SymbolLayer } from "@/lib/types/canvas";
import { symbolHasOutline } from "@/lib/canvas/symbol-outline";
import { removeBulletFromFact } from "@/lib/notes/remove-bullet-from-fact";
import type { ParsedNotes } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { BulletFields } from "../bullet-fields";
import { beginOutlineDrag } from "./outline-drag";

interface SymbolRowProps {
  symbolId: string;
  factId: string;
  /** Index of this bullet within the fact (for drag drop-position math). */
  index: number;
  notes: string;
  parsed: ParsedNotes;
  currentId: string;
}

interface Resolved {
  displayName: string;
  imageUrl: string | null;
  broken: boolean;
}

function resolveSymbol(layer: SymbolLayer | null | undefined): Resolved {
  if (!layer) return { displayName: "missing", imageUrl: null, broken: true };
  if (!isImageSymbolLayer(layer)) {
    return { displayName: "region", imageUrl: null, broken: false };
  }
  const entry = getSymbolById(layer.ref);
  if (!entry) return { displayName: layer.ref, imageUrl: null, broken: false };
  return { displayName: entry.displayName, imageUrl: entry.imageUrl, broken: false };
}

/**
 * One symbol bullet inside a Fact card: a selectable identity strip (thumbnail
 * + name), an inline DESC/MEAN/WHY editor, and an untag ✕. Selecting/hovering
 * mirrors the canvas the same way the CodeMirror chip does.
 */
export function SymbolRow({ symbolId, factId, index, notes, parsed, currentId }: SymbolRowProps) {
  const setNotes = useStore((s) => s.setNotes);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);
  const setHoveredSymbol = useStore((s) => s.setHoveredSymbol);

  // Select the layer (stable ref) and resolve inline so unrelated store
  // updates (hover, selection) don't churn this row.
  const layer = useStore((s) => {
    const cid = s.currentPicmonicId;
    if (!cid) return null;
    return s.picmonics[cid]?.canvas.symbols.find((sy) => sy.id === symbolId) ?? null;
  });
  const resolved = resolveSymbol(layer);

  const selected = useStore((s) => s.selectedSymbolIds.includes(symbolId));
  const hovered = useStore((s) => s.hoveredSymbolId === symbolId);
  const lastSyncSource = useStore((s) => s.lastSyncSource);

  const rowRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if ((selected || hovered) && lastSyncSource === "canvas") {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected, hovered, lastSyncSource]);

  const onSelect = React.useCallback(() => {
    const st = useStore.getState();
    st.setLastSyncSource("editor");
    st.setSelectedSymbolIds([symbolId]);
    const cid = st.currentPicmonicId;
    const layer = cid
      ? st.picmonics[cid]?.canvas.symbols.find((sy) => sy.id === symbolId)
      : undefined;
    if (!symbolHasOutline(layer)) st.requestOutlineConfirm(symbolId);
  }, [symbolId]);

  const onDelete = React.useCallback(() => {
    const result = removeBulletFromFact(notes, parsed, factId, symbolId);
    if (!result.ok) return;
    setLastSyncSource("editor");
    setNotes(currentId, result.newNotes);
  }, [notes, parsed, factId, symbolId, currentId, setNotes, setLastSyncSource]);

  return (
    <div
      ref={rowRef}
      data-drag-row
      data-symbol-id={symbolId}
      data-fact-id={factId}
      data-bullet-index={index}
      className={cn(
        "eng-outline-row group/row relative border-t border-border/35 first:border-t-0",
        (selected || hovered) && "eng-outline-row--lit",
      )}
      onMouseEnter={() => setHoveredSymbol(symbolId)}
      onMouseLeave={() => setHoveredSymbol(null)}
    >
      <div className="flex items-center gap-1.5 px-2 pt-1.5">
        <span
          role="button"
          aria-label="Drag to reorder symbol"
          title="Drag to reorder or move to another fact"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            beginOutlineDrag(
              { kind: "row", symbolId, fromFactId: factId, label: resolved.displayName, imageUrl: resolved.imageUrl },
              e.nativeEvent,
            );
          }}
          className="eng-outline-grip flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/35 opacity-0 transition-opacity hover:text-muted-foreground/70 group-hover/row:opacity-100"
        >
          <GripVertical className="size-3.5" />
        </span>
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title="Select this symbol on the canvas"
        >
          {resolved.broken ? (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-dashed border-destructive/50 bg-destructive/10">
              <span className="size-1.5 rounded-full bg-destructive/70" />
            </span>
          ) : resolved.imageUrl ? (
            <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-foreground/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolved.imageUrl}
                alt=""
                className="size-full object-contain"
                draggable={false}
              />
            </span>
          ) : (
            <span className="size-4 shrink-0 rounded-sm bg-accent/20 ring-1 ring-accent/30" />
          )}
          <span
            className={cn(
              "truncate font-mono text-[10px] uppercase tracking-[0.16em]",
              resolved.broken
                ? "text-destructive/70"
                : "text-muted-foreground/80",
            )}
          >
            {resolved.displayName}
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove this symbol from the fact"
          title="Remove from this fact (keeps it on the canvas)"
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive/80 focus-visible:opacity-100 group-hover/row:opacity-100"
        >
          <X className="size-3" />
        </button>
      </div>
      <div className="pb-0.5">
        <BulletFields
          symbolId={symbolId}
          factId={factId}
          parsed={parsed}
          notes={notes}
          currentId={currentId}
          setNotes={setNotes}
          setLastSyncSource={setLastSyncSource}
        />
      </div>
    </div>
  );
}
