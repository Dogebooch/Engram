"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, usePicmonic } from "@/lib/store/hooks";
import { getSymbolById } from "@/lib/symbols";
import { parseNotes } from "@/lib/notes/parse";
import { parseBullet, updateBulletParts } from "@/lib/notes/bullet";
import type { ParsedNotes } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import {
  computePopoverAnchor,
  type AnchorFitBox,
} from "./describe-popover-anchor";

const POPOVER_WIDTH = 360;
// Estimate used only to decide below/above placement; the rendered card sizes
// to its content. A region near the bottom edge flips above.
const POPOVER_EST_HEIGHT = 220;

interface DraftParts {
  description: string;
  meaning: string;
  encoding: string;
}

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

  const fact = parsed.factsById.get(activeFactId) ?? null;

  // Locate the active bullet line (for repopulation on external edits).
  const lineText = React.useMemo(() => {
    if (!fact) return "";
    const ref = fact.symbolRefs.find((r) => r.symbolId === symbolId);
    if (!ref) return "";
    let lineStart = ref.start;
    while (lineStart > 0 && notes.charCodeAt(lineStart - 1) !== 10) lineStart--;
    let lineEnd = notes.indexOf("\n", ref.end);
    if (lineEnd === -1) lineEnd = notes.length;
    return notes.slice(lineStart, lineEnd);
  }, [fact, notes, symbolId]);

  const parsedBullet = React.useMemo(() => parseBullet(lineText), [lineText]);

  // Local draft — synced from parsed only when the bullet identity changes, or
  // when notes diverge from what we last wrote (external CodeMirror edit).
  const lastWriteRef = React.useRef<string | null>(null);
  const [draft, setDraft] = React.useState<DraftParts>({
    description: parsedBullet.description,
    meaning: parsedBullet.meaning ?? "",
    encoding: parsedBullet.encoding ?? "",
  });

  const identityKey = `${symbolId}::${activeFactId}`;
  const prevIdentityRef = React.useRef(identityKey);

  React.useEffect(() => {
    if (prevIdentityRef.current !== identityKey) {
      prevIdentityRef.current = identityKey;
      setDraft({
        description: parsedBullet.description,
        meaning: parsedBullet.meaning ?? "",
        encoding: parsedBullet.encoding ?? "",
      });
      lastWriteRef.current = null;
      return;
    }
    if (lastWriteRef.current !== null && lastWriteRef.current === notes) return;
    if (lastWriteRef.current !== null && lastWriteRef.current !== notes) {
      lastWriteRef.current = null;
      setDraft({
        description: parsedBullet.description,
        meaning: parsedBullet.meaning ?? "",
        encoding: parsedBullet.encoding ?? "",
      });
    }
  }, [identityKey, notes, parsedBullet]);

  const commit = React.useCallback(
    (next: DraftParts) => {
      if (!currentId) return;
      const result = updateBulletParts(notes, parsed, activeFactId, symbolId, {
        description: next.description,
        meaning: next.meaning === "" ? null : next.meaning,
        encoding: next.encoding === "" ? null : next.encoding,
      });
      if (!result.ok || result.newNotes === notes) return;
      lastWriteRef.current = result.newNotes;
      setLastSyncSource("editor");
      setNotes(currentId, result.newNotes);
    },
    [activeFactId, currentId, notes, parsed, setLastSyncSource, setNotes, symbolId],
  );

  const setField = React.useCallback(
    (field: keyof DraftParts, value: string) => {
      const next = { ...draft, [field]: value };
      setDraft(next);
      commit(next);
    },
    [commit, draft],
  );

  const entry = layerRef ? getSymbolById(layerRef) : null;
  const displayName = entry?.displayName ?? (layerRef ? layerRef : "region");
  const imageUrl = entry?.imageUrl ?? null;

  const descRef = React.useRef<HTMLTextAreaElement>(null);
  const meanRef = React.useRef<HTMLTextAreaElement>(null);
  const whyRef = React.useRef<HTMLTextAreaElement>(null);

  // Esc dismisses the popover (selection stays). Writes are already saved.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const onAdvanceField = (current: "desc" | "mean") => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (current === "desc") meanRef.current?.focus();
      else whyRef.current?.focus();
    }
  };

  // On the Why textarea, plain Enter closes; Shift+Enter inserts a newline.
  const onWhyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      close();
    }
  };

  // Focus the description on open.
  React.useEffect(() => {
    descRef.current?.focus();
    descRef.current?.select();
  }, []);

  const descEmpty = draft.description.trim().length === 0;
  const meanEmpty = draft.meaning.trim().length === 0;
  const whyEmpty = draft.encoding.trim().length === 0;

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

      {/* Fields */}
      <FieldRow label="DESC" align="top">
        <textarea
          ref={descRef}
          value={draft.description}
          onChange={(e) => setField("description", e.target.value)}
          onKeyDown={onAdvanceField("desc")}
          placeholder="visual description"
          aria-required
          rows={1}
          className={cn(
            "field-sizing-content min-h-7 w-full resize-none bg-transparent py-1 font-mono text-[12.5px] leading-snug text-foreground/95 outline-none placeholder:italic placeholder:text-muted-foreground/40",
            "border-b border-transparent focus:border-foreground/45",
            descEmpty && "border-dashed border-destructive/55",
          )}
          style={{ maxHeight: "7em" }}
        />
        {descEmpty && (
          <span className="pointer-events-none absolute right-2 top-2 font-mono text-[9px] uppercase tracking-[0.22em] text-destructive/70">
            · required
          </span>
        )}
      </FieldRow>
      <Connector glyph="↓" />
      <FieldRow label="MEAN" align="top">
        <textarea
          ref={meanRef}
          value={draft.meaning}
          onChange={(e) => setField("meaning", e.target.value)}
          onKeyDown={onAdvanceField("mean")}
          placeholder="meaning…"
          rows={1}
          className={cn(
            "field-sizing-content min-h-7 w-full resize-none bg-transparent py-1 font-mono text-[12.5px] leading-snug text-foreground/95 outline-none placeholder:italic placeholder:text-muted-foreground/40",
            "border-b border-transparent focus:border-foreground/45",
            meanEmpty && "border-dashed border-foreground/15",
          )}
          style={{ maxHeight: "7em" }}
        />
      </FieldRow>
      <Connector glyph=";" />
      <FieldRow label="WHY" align="top">
        <textarea
          ref={whyRef}
          value={draft.encoding}
          onChange={(e) => setField("encoding", e.target.value)}
          onKeyDown={onWhyKeyDown}
          placeholder="why this image…"
          rows={1}
          className={cn(
            "field-sizing-content min-h-7 w-full resize-none bg-transparent py-1 font-mono text-[12.5px] leading-snug text-foreground/95 outline-none placeholder:italic placeholder:text-muted-foreground/40",
            "border-b border-transparent focus:border-foreground/45",
            whyEmpty && "border-dashed border-foreground/15",
          )}
          style={{ maxHeight: "10em" }}
        />
      </FieldRow>
    </div>
  );
}

interface FieldRowProps {
  label: string;
  align?: "center" | "top";
  children: React.ReactNode;
}

function FieldRow({ label, align = "center", children }: FieldRowProps) {
  return (
    <div
      className={cn(
        "relative flex gap-0 px-3",
        align === "top" ? "items-start py-0.5" : "items-center",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-[56px] shrink-0 select-none border-r border-border/40 pr-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground/70",
          align === "top" ? "items-start pt-2" : "items-center",
        )}
      >
        {label}
      </div>
      <div className="relative flex flex-1 items-center pl-2.5">{children}</div>
    </div>
  );
}

function Connector({ glyph }: { glyph: string }) {
  return (
    <div className="flex h-2 items-center px-3">
      <div className="flex w-[56px] shrink-0 justify-center border-r border-border/40 pr-2">
        <span className="font-mono text-[10px] leading-none text-muted-foreground/40">
          {glyph}
        </span>
      </div>
    </div>
  );
}
