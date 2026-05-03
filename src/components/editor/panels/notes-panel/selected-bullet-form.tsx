"use client";

import * as React from "react";
import { X, ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { getSymbolById } from "@/lib/symbols";
import { parseBullet, updateBulletParts } from "@/lib/notes/bullet";

interface DraftParts {
  description: string;
  meaning: string;
  encoding: string;
}
import type { ParsedNotes } from "@/lib/notes/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface SelectedBulletFormProps {
  parsed: ParsedNotes;
  notes: string;
  currentId: string | null;
  setNotes: (id: string, notes: string) => void;
  setLastSyncSource: (src: "canvas" | "editor" | null) => void;
}

export function SelectedBulletForm(props: SelectedBulletFormProps) {
  const selectedIds = useStore((s) => s.selectedSymbolIds);
  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const factIds = React.useMemo(
    () => (id ? (props.parsed.factsBySymbolId.get(id) ?? []) : []),
    [id, props.parsed],
  );

  if (!id || factIds.length === 0) return null;

  return (
    <SelectedBulletFormInner
      key={id}
      symbolId={id}
      factIds={factIds}
      {...props}
    />
  );
}

interface InnerProps extends SelectedBulletFormProps {
  symbolId: string;
  factIds: string[];
}

function SelectedBulletFormInner({
  symbolId,
  factIds,
  parsed,
  notes,
  currentId,
  setNotes,
  setLastSyncSource,
}: InnerProps) {
  // Active Fact — defaults to first. We store the user's chosen factId, but
  // derive the *effective* factId synchronously each render so a stale id
  // (rename, untag) is never used.
  const [chosenFactId, setChosenFactId] = React.useState<string>(factIds[0]);
  const activeFactId =
    chosenFactId && parsed.factsById.has(chosenFactId) && factIds.includes(chosenFactId)
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

  // Local draft state — NOT derived-per-render. Sync from parsed only when the
  // bullet identity changes, or when notes diverge from what we last wrote.
  const lastWriteRef = React.useRef<string | null>(null);
  const [draft, setDraft] = React.useState<DraftParts>({
    description: parsedBullet.description,
    meaning: parsedBullet.meaning ?? "",
    encoding: parsedBullet.encoding ?? "",
  });

  // Identity key for "is this the same bullet?" — changes when symbol or fact
  // changes. We DON'T include `lineText` here because it changes on our own
  // writes; we use lastWriteRef to gate notes-content-driven resyncs.
  const identityKey = `${symbolId}::${activeFactId}`;
  const prevIdentityRef = React.useRef(identityKey);

  React.useEffect(() => {
    if (prevIdentityRef.current !== identityKey) {
      // Bullet identity changed (symbol or fact switch): repopulate.
      prevIdentityRef.current = identityKey;
      setDraft({
        description: parsedBullet.description,
        meaning: parsedBullet.meaning ?? "",
        encoding: parsedBullet.encoding ?? "",
      });
      lastWriteRef.current = null;
      return;
    }
    // Same bullet — only resync from parsed if notes diverged from our last write.
    if (lastWriteRef.current !== null && lastWriteRef.current === notes) return;
    if (lastWriteRef.current !== null && lastWriteRef.current !== notes) {
      // External edit since our last write: resync.
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

  // Resolve symbol identity for header strip.
  const layer = useStore((s) => {
    const cid = s.currentPicmonicId;
    if (!cid) return null;
    const p = s.picmonics[cid];
    if (!p) return null;
    return p.canvas.symbols.find((sy) => sy.id === symbolId) ?? null;
  });
  const entry = layer ? getSymbolById(layer.ref) : null;
  const displayName = entry?.displayName ?? layer?.ref ?? "symbol";
  const sourceLabel = entry?.source ?? null;
  const imageUrl = entry?.imageUrl ?? null;

  const clearSelection = useStore((s) => s.clearSelection);

  // Focus management refs.
  const descRef = React.useRef<HTMLInputElement>(null);
  const meanRef = React.useRef<HTMLInputElement>(null);
  const whyRef = React.useRef<HTMLTextAreaElement>(null);

  // Cmd/Ctrl+Enter → focus CodeMirror at the bullet line.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.currentTarget.dispatchEvent(new Event("blur", { bubbles: true }));
      const stage = document.querySelector<HTMLElement>("[data-eng-canvas-stage]");
      stage?.focus();
      return;
    }
  };

  const onAdvanceField = (current: "desc" | "mean") => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (current === "desc") meanRef.current?.focus();
      else whyRef.current?.focus();
    }
  };

  const descEmpty = draft.description.trim().length === 0;
  const meanEmpty = draft.meaning.trim().length === 0;
  const whyEmpty = draft.encoding.trim().length === 0;

  const factName = fact?.name ?? "";
  const showSelector = factIds.length > 1;
  const useDropdown = factIds.length >= 4;

  return (
    <div
      className="eng-bullet-form flex flex-shrink-0 flex-col border-b border-border/60 bg-card/60"
      data-eng-bullet-form
      onKeyDown={handleKeyDown}
    >
      {/* Identity strip */}
      <div className="flex h-7 items-center gap-2 px-3">
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
          onClick={clearSelection}
          aria-label="Deselect"
          className={cn(
            "flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/85",
            !showSelector && !factName && "ml-auto",
            (showSelector || factName) && "ml-1",
          )}
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Fact selector */}
      {showSelector && !useDropdown && (
        <div className="flex h-[26px] items-center gap-1 border-t border-border/40 px-2 pb-0.5 pt-0.5">
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
                  "flex h-[22px] flex-1 items-center justify-center truncate rounded-md border px-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
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
      {showSelector && useDropdown && (
        <div className="flex h-[26px] items-center border-t border-border/40 px-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex h-[22px] w-full items-center gap-1.5 rounded-md border border-foreground/15 bg-foreground/[0.04] px-2",
                "font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/90",
                "hover:bg-foreground/[0.07] focus-visible:outline-none",
              )}
            >
              <span className="truncate">{factName}</span>
              <ChevronDown className="ml-auto size-3 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              {factIds.map((fid) => {
                const f = parsed.factsById.get(fid);
                if (!f) return null;
                return (
                  <DropdownMenuItem
                    key={fid}
                    onSelect={() => setChosenFactId(fid)}
                    className="font-mono text-xs"
                  >
                    {f.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Fields */}
      <FieldRow
        label="DESC"
        empty={descEmpty}
        emptyVariant="required"
      >
        <input
          ref={descRef}
          type="text"
          value={draft.description}
          onChange={(e) => setField("description", e.target.value)}
          onKeyDown={onAdvanceField("desc")}
          placeholder="visual description"
          aria-required
          className={cn(
            "h-7 w-full bg-transparent font-mono text-[12.5px] text-foreground/95 outline-none placeholder:italic placeholder:text-muted-foreground/40",
            "border-b border-transparent",
            "focus:border-foreground/45",
            descEmpty && "border-dashed border-destructive/55",
          )}
        />
        {descEmpty && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.22em] text-destructive/70">
            · required
          </span>
        )}
      </FieldRow>
      <Connector glyph="↓" />
      <FieldRow
        label="MEAN"
        empty={meanEmpty}
        emptyVariant="optional"
      >
        <input
          ref={meanRef}
          type="text"
          value={draft.meaning}
          onChange={(e) => setField("meaning", e.target.value)}
          onKeyDown={onAdvanceField("mean")}
          placeholder="meaning…"
          className={cn(
            "h-7 w-full bg-transparent font-mono text-[12.5px] text-foreground/95 outline-none placeholder:italic placeholder:text-muted-foreground/40",
            "border-b border-transparent",
            "focus:border-foreground/45",
            meanEmpty && "border-dashed border-foreground/15",
          )}
        />
      </FieldRow>
      <Connector glyph=";" />
      <FieldRow
        label="WHY"
        empty={whyEmpty}
        emptyVariant="optional"
        align="top"
      >
        <textarea
          ref={whyRef}
          value={draft.encoding}
          onChange={(e) => setField("encoding", e.target.value)}
          placeholder="why this image…"
          rows={1}
          className={cn(
            "field-sizing-content min-h-7 w-full resize-none bg-transparent py-1 font-mono text-[12.5px] leading-snug text-foreground/95 outline-none placeholder:italic placeholder:text-muted-foreground/40",
            "border-b border-transparent",
            "focus:border-foreground/45",
            whyEmpty && "border-dashed border-foreground/15",
          )}
          style={{ maxHeight: "5.5em" }}
        />
      </FieldRow>
    </div>
  );
}

interface FieldRowProps {
  label: string;
  empty: boolean;
  emptyVariant: "required" | "optional";
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
          "flex w-[64px] shrink-0 select-none border-r border-border/40 pr-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground/70",
          align === "top" ? "items-start pt-2" : "items-center",
          align === "top" ? "h-7" : "h-7",
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
      <div className="flex w-[64px] shrink-0 justify-center border-r border-border/40 pr-2">
        <span className="font-mono text-[10px] leading-none text-muted-foreground/40">
          {glyph}
        </span>
      </div>
    </div>
  );
}
