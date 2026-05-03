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
  const [chosenFactId, setChosenFactId] = React.useState<string>(factIds[0]);
  const activeFactId =
    chosenFactId && parsed.factsById.has(chosenFactId) && factIds.includes(chosenFactId)
      ? chosenFactId
      : factIds[0];

  const fact = parsed.factsById.get(activeFactId) ?? null;

  const ref = React.useMemo(
    () => fact?.symbolRefs.find((r) => r.symbolId === symbolId) ?? null,
    [fact, symbolId],
  );

  const lineText = React.useMemo(() => {
    if (!ref) return "";
    let lineStart = ref.start;
    while (lineStart > 0 && notes.charCodeAt(lineStart - 1) !== 10) lineStart--;
    let lineEnd = notes.indexOf("\n", ref.end);
    if (lineEnd === -1) lineEnd = notes.length;
    return notes.slice(lineStart, lineEnd);
  }, [ref, notes]);

  const parsedBullet = React.useMemo(() => parseBullet(lineText), [lineText]);

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

  const layer = useStore((s) => {
    const cid = s.currentPicmonicId;
    if (!cid) return null;
    const p = s.picmonics[cid];
    if (!p) return null;
    return p.canvas.symbols.find((sy) => sy.id === symbolId) ?? null;
  });
  const entry = layer ? getSymbolById(layer.ref) : null;
  const displayName = entry?.displayName ?? layer?.ref ?? "symbol";
  const imageUrl = entry?.imageUrl ?? null;

  const clearSelection = useStore((s) => s.clearSelection);

  const descRef = React.useRef<HTMLInputElement>(null);
  const meanRef = React.useRef<HTMLInputElement>(null);
  const whyRef = React.useRef<HTMLTextAreaElement>(null);

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

  const factName = fact?.name ?? "";
  const showSelector = factIds.length > 1;
  const useDropdown = factIds.length >= 4;

  return (
    <div
      className="eng-bullet-form flex flex-shrink-0 flex-col border-b border-border/60 bg-card/40"
      data-eng-bullet-form
      onKeyDown={handleKeyDown}
    >
      {/* Identity strip */}
      <div className="flex h-8 items-center gap-2 px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/55">
          editing
        </span>
        {imageUrl ? (
          <span className="flex size-[18px] items-center justify-center overflow-hidden rounded-sm bg-foreground/[0.04]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="size-full object-contain"
              draggable={false}
            />
          </span>
        ) : (
          <span className="size-[18px] rounded-sm bg-foreground/[0.06]" />
        )}
        <span className="truncate text-[12px] font-medium text-foreground/90">
          {displayName}
        </span>
        {showSelector && !useDropdown && (
          <span className="ml-1 text-muted-foreground/40">·</span>
        )}
        {showSelector && !useDropdown && (
          <div className="flex min-w-0 items-center gap-0.5">
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
                    "max-w-[140px] truncate rounded px-1.5 py-0.5 text-[11px] transition-colors",
                    active
                      ? "bg-foreground/[0.08] text-foreground/95"
                      : "text-muted-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground/85",
                  )}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        )}
        {showSelector && useDropdown && (
          <>
            <span className="ml-1 text-muted-foreground/40">·</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex min-w-0 max-w-[180px] items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
                  "text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground/95 focus-visible:outline-none",
                )}
              >
                <span className="truncate">{factName}</span>
                <ChevronDown className="size-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {factIds.map((fid) => {
                  const f = parsed.factsById.get(fid);
                  if (!f) return null;
                  return (
                    <DropdownMenuItem
                      key={fid}
                      onSelect={() => setChosenFactId(fid)}
                      className="text-xs"
                    >
                      {f.name}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Deselect"
          className="ml-auto flex size-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/85"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Body — frame the bullet as it would read in markdown, but as inputs */}
      <div className="flex flex-col gap-1 px-3 pb-2.5">
        <div className="relative">
          <input
            ref={descRef}
            type="text"
            value={draft.description}
            onChange={(e) => setField("description", e.target.value)}
            onKeyDown={onAdvanceField("desc")}
            placeholder="visual description"
            aria-required
            aria-label="Description"
            className={cn(
              "h-7 w-full rounded-sm border bg-transparent px-2 text-[13px] text-foreground/95 outline-none transition-colors",
              "placeholder:italic placeholder:text-muted-foreground/40",
              "focus:border-foreground/35 focus:bg-foreground/[0.02]",
              descEmpty
                ? "border-destructive/40"
                : "border-transparent hover:border-foreground/15",
            )}
          />
          {descEmpty && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.22em] text-destructive/70">
              required
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className="font-mono text-[11px] leading-none text-muted-foreground/45"
            aria-hidden
          >
            →
          </span>
          <input
            ref={meanRef}
            type="text"
            value={draft.meaning}
            onChange={(e) => setField("meaning", e.target.value)}
            onKeyDown={onAdvanceField("mean")}
            placeholder="what it means"
            aria-label="Meaning"
            className={cn(
              "h-7 flex-1 rounded-sm border border-transparent bg-transparent px-2 text-[13px] text-foreground/90 outline-none transition-colors",
              "placeholder:italic placeholder:text-muted-foreground/40",
              "hover:border-foreground/15 focus:border-foreground/35 focus:bg-foreground/[0.02]",
            )}
          />
        </div>

        <div className="flex items-start gap-1">
          <span
            className="pt-1.5 font-mono text-[12px] leading-none text-muted-foreground/55"
            aria-hidden
          >
            (
          </span>
          <textarea
            ref={whyRef}
            value={draft.encoding}
            onChange={(e) => setField("encoding", e.target.value)}
            placeholder="encoding note — why this image"
            rows={1}
            aria-label="Encoding note"
            className={cn(
              "field-sizing-content min-h-7 flex-1 resize-none rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] italic leading-snug text-muted-foreground/85 outline-none transition-colors",
              "placeholder:not-italic placeholder:text-muted-foreground/40",
              "hover:border-foreground/15 focus:border-foreground/35 focus:bg-foreground/[0.02] focus:text-foreground/90",
            )}
            style={{ maxHeight: "5.5em" }}
          />
          <span
            className="pt-1.5 font-mono text-[12px] leading-none text-muted-foreground/55"
            aria-hidden
          >
            )
          </span>
        </div>
      </div>
    </div>
  );
}
