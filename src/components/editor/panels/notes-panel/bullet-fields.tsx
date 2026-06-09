"use client";

import * as React from "react";
import { X } from "lucide-react";
import { parseBullet, updateBulletParts } from "@/lib/notes/bullet";
import type { ParsedNotes } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

interface DraftParts {
  description: string;
  meaning: string;
  encoding: string;
}

export interface BulletFieldsProps {
  symbolId: string;
  /** The Fact whose bullet for `symbolId` we edit. */
  factId: string;
  parsed: ParsedNotes;
  notes: string;
  currentId: string | null;
  setNotes: (id: string, notes: string) => void;
  setLastSyncSource: (src: "canvas" | "editor" | null) => void;
  /** Focus + select the description on mount (canvas popover open). */
  autoFocus?: boolean;
  /** Plain-Enter on the Why field, or an explicit dismiss request. */
  onRequestClose?: () => void;
}

/**
 * The DESC → MEAN → WHY structured bullet editor. Controlled draft that commits
 * each change straight through `updateBulletParts` (markdown stays canonical;
 * no parallel content state). Shared by the canvas `DescribePopover` and the
 * Form view's inline Fact-card rows.
 */
export function BulletFields({
  symbolId,
  factId,
  parsed,
  notes,
  currentId,
  setNotes,
  setLastSyncSource,
  autoFocus = false,
  onRequestClose,
}: BulletFieldsProps) {
  const fact = parsed.factsById.get(factId) ?? null;

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
  // when notes diverge from what we last wrote (external edit elsewhere).
  const lastWriteRef = React.useRef<string | null>(null);
  const [draft, setDraft] = React.useState<DraftParts>({
    description: parsedBullet.description,
    meaning: parsedBullet.meaning ?? "",
    encoding: parsedBullet.encoding ?? "",
  });

  const identityKey = `${symbolId}::${factId}`;
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
      const result = updateBulletParts(notes, parsed, factId, symbolId, {
        description: next.description,
        meaning: next.meaning === "" ? null : next.meaning,
        encoding: next.encoding === "" ? null : next.encoding,
      });
      if (!result.ok || result.newNotes === notes) return;
      lastWriteRef.current = result.newNotes;
      setLastSyncSource("editor");
      setNotes(currentId, result.newNotes);
    },
    [currentId, factId, notes, parsed, setLastSyncSource, setNotes, symbolId],
  );

  const setField = React.useCallback(
    (field: keyof DraftParts, value: string) => {
      const next = { ...draft, [field]: value };
      setDraft(next);
      commit(next);
    },
    [commit, draft],
  );

  const descRef = React.useRef<HTMLTextAreaElement>(null);
  const meanRef = React.useRef<HTMLTextAreaElement>(null);
  const whyRef = React.useRef<HTMLTextAreaElement>(null);

  const onAdvanceField = (current: "desc" | "mean") => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (current === "desc") meanRef.current?.focus();
      else whyRef.current?.focus();
    }
  };

  // Plain Enter on Why: close (popover) or blur (inline row). Shift+Enter = newline.
  const onWhyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (onRequestClose) onRequestClose();
      else whyRef.current?.blur();
    }
  };

  React.useEffect(() => {
    if (!autoFocus) return;
    descRef.current?.focus();
    descRef.current?.select();
  }, [autoFocus]);

  const descEmpty = draft.description.trim().length === 0;
  const meanEmpty = draft.meaning.trim().length === 0;
  const whyEmpty = draft.encoding.trim().length === 0;

  if (!fact) return null;

  const textareaClass = cn(
    "field-sizing-content min-h-7 w-full resize-none bg-transparent py-1 pr-6 font-mono text-[12.5px] leading-snug text-foreground/95 outline-none placeholder:italic placeholder:text-muted-foreground/40",
    "border-b border-transparent focus:border-foreground/45",
  );

  return (
    <>
      <FieldRow
        label="DESC"
        clearable={!descEmpty}
        onClear={() => {
          setField("description", "");
          descRef.current?.focus();
        }}
      >
        <textarea
          ref={descRef}
          value={draft.description}
          onChange={(e) => setField("description", e.target.value)}
          onKeyDown={onAdvanceField("desc")}
          placeholder="visual description"
          aria-required
          rows={1}
          className={cn(textareaClass, descEmpty && "border-dashed border-destructive/55")}
          style={{ maxHeight: "7em" }}
        />
        {descEmpty && (
          <span className="pointer-events-none absolute right-2 top-2 font-mono text-[9px] uppercase tracking-[0.22em] text-destructive/70">
            · required
          </span>
        )}
      </FieldRow>
      <Connector glyph="↓" />
      <FieldRow
        label="MEAN"
        clearable={!meanEmpty}
        onClear={() => {
          setField("meaning", "");
          meanRef.current?.focus();
        }}
      >
        <textarea
          ref={meanRef}
          value={draft.meaning}
          onChange={(e) => setField("meaning", e.target.value)}
          onKeyDown={onAdvanceField("mean")}
          placeholder="meaning…"
          rows={1}
          className={cn(textareaClass, meanEmpty && "border-dashed border-foreground/15")}
          style={{ maxHeight: "7em" }}
        />
      </FieldRow>
      <Connector glyph=";" />
      <FieldRow
        label="WHY"
        clearable={!whyEmpty}
        onClear={() => {
          setField("encoding", "");
          whyRef.current?.focus();
        }}
      >
        <textarea
          ref={whyRef}
          value={draft.encoding}
          onChange={(e) => setField("encoding", e.target.value)}
          onKeyDown={onWhyKeyDown}
          placeholder="why this image…"
          rows={1}
          className={cn(textareaClass, whyEmpty && "border-dashed border-foreground/15")}
          style={{ maxHeight: "10em" }}
        />
      </FieldRow>
    </>
  );
}

interface FieldRowProps {
  label: string;
  clearable?: boolean;
  onClear?: () => void;
  children: React.ReactNode;
}

function FieldRow({ label, clearable, onClear, children }: FieldRowProps) {
  return (
    <div className="group/field relative flex items-start gap-0 px-3 py-0.5">
      <div className="flex h-7 w-[56px] shrink-0 select-none items-start border-r border-border/40 pr-2 pt-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground/70">
        {label}
      </div>
      <div className="relative flex flex-1 items-center pl-2.5">
        {children}
        {clearable && onClear && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClear}
            aria-label={`Clear ${label.toLowerCase()}`}
            title={`Clear ${label.toLowerCase()}`}
            className="absolute right-0.5 top-1.5 flex size-4 items-center justify-center rounded text-muted-foreground/45 opacity-0 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground/80 focus-visible:opacity-100 group-hover/field:opacity-100"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
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
