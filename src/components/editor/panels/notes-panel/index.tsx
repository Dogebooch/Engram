"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, usePicmonic } from "@/lib/store/hooks";
import { lintGutter } from "@codemirror/lint";
import { parseNotes } from "@/lib/notes/parse";
import { lintNotes } from "@/lib/notes/lint";
import { buildBaseExtensions } from "@/lib/notes/codemirror/setup";
import { factHeadingExtension } from "@/lib/notes/codemirror/fact-heading-extension";
import { symbolChipExtension } from "@/lib/notes/codemirror/sym-token-extension";
import { buildBulletLinterExtension } from "@/lib/notes/codemirror/lint-extension";
import { transientHighlightField } from "./transient-highlight";
import { NotesBreadcrumb } from "./breadcrumb";
import { SelectedBulletForm } from "./selected-bullet-form";
import { useCodeMirror } from "./use-codemirror";
import { useSymbolResolver } from "./use-symbol-resolver";
import { useSyncCanvasToEditor } from "./use-sync-canvas-to-editor";
import { useEditorToCanvasSync } from "./use-sync-editor-to-canvas";

export function NotesPanel() {
  const picmonic = usePicmonic();
  const currentId = useCurrentPicmonicId();
  const setNotes = useStore((s) => s.setNotes);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);

  const value = picmonic?.notes ?? "";
  const parsed = React.useMemo(() => parseNotes(value), [value]);

  const { onCursorChange, parsedRef, breadcrumb } = useEditorToCanvasSync();
  React.useEffect(() => {
    parsedRef.current = parsed;
  }, [parsed, parsedRef]);

  const handleChange = React.useCallback(
    (next: string) => {
      if (currentId) setNotes(currentId, next);
    },
    [currentId, setNotes],
  );

  const extensions = React.useMemo(
    () => [
      ...buildBaseExtensions(),
      symbolChipExtension,
      factHeadingExtension,
      transientHighlightField,
      lintGutter(),
      buildBulletLinterExtension(),
    ],
    [],
  );

  const { setHostRef, view } = useCodeMirror({
    value,
    onChange: handleChange,
    onCursorChange,
    extensions,
  });

  useSymbolResolver(view);
  useSyncCanvasToEditor(view, parsed);

  const symbolIds = React.useMemo(() => {
    const ids = picmonic?.canvas.symbols.map((sy) => sy.id.toLowerCase()) ?? [];
    return new Set(ids);
  }, [picmonic]);

  const lintIssues = React.useMemo(
    () => lintNotes(value, parsed, symbolIds),
    [value, parsed, symbolIds],
  );

  const lintCounts = React.useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const i of lintIssues) {
      if (i.severity === "error") errors++;
      else warnings++;
    }
    return { errors, warnings };
  }, [lintIssues]);

  const jumpToFirstIssue = React.useCallback(() => {
    if (!view || lintIssues.length === 0) return;
    const first = lintIssues.reduce((a, b) => (a.from <= b.from ? a : b));
    view.focus();
    view.dispatch({
      selection: { anchor: first.from },
      scrollIntoView: true,
    });
  }, [view, lintIssues]);

  const isEmpty = value.trim().length === 0;

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border px-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          notes
        </span>
        <div className="flex items-center gap-3">
          {(lintCounts.errors > 0 || lintCounts.warnings > 0) && (
            <button
              type="button"
              onClick={jumpToFirstIssue}
              title="Jump to first issue"
              className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70 hover:text-foreground"
            >
              {lintCounts.errors > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <span className="size-[5px] rounded-full bg-destructive" />
                  {lintCounts.errors} error{lintCounts.errors === 1 ? "" : "s"}
                </span>
              )}
              {lintCounts.errors > 0 && lintCounts.warnings > 0 && (
                <span className="text-muted-foreground/40">·</span>
              )}
              {lintCounts.warnings > 0 && (
                <span className="flex items-center gap-1 text-amber-500">
                  <span className="size-[5px] rounded-full bg-amber-500" />
                  {lintCounts.warnings} warn{lintCounts.warnings === 1 ? "" : "s"}
                </span>
              )}
            </button>
          )}
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/45">
            <span className="size-[5px] rounded-full bg-muted-foreground/35" />
            markdown
          </span>
        </div>
      </div>
      <NotesBreadcrumb breadcrumb={breadcrumb} />
      <SelectedBulletForm
        parsed={parsed}
        notes={value}
        currentId={currentId ?? null}
        setNotes={setNotes}
        setLastSyncSource={setLastSyncSource}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div
          ref={setHostRef}
          className="eng-notes-host h-full w-full overflow-hidden"
          data-eng-notes-editor
        />
        {isEmpty && <NotesEmptyOverlay />}
      </div>
    </div>
  );
}

function NotesEmptyOverlay() {
  return (
    <div className="eng-notes-empty" data-eng-notes-empty>
      <div className="eng-notes-empty__inner">
        <div className="eng-notes-empty__hint">
          <span className="eng-notes-empty__caret">▍</span>
          <span className="eng-notes-empty__comment">
            {`<!-- drop a symbol on canvas, or start with `}
            <span className="text-foreground/65">{`# Section`}</span>
            {` / `}
            <span className="text-foreground/65">{`## Fact`}</span>
            {` -->`}
          </span>
        </div>
        <div className="eng-notes-empty__rule" aria-hidden />
        <div className="eng-notes-empty__keys">
          <span>sync</span>
          <span>·</span>
          <span className="eng-notes-empty__kbd">/</span>
          <span>library</span>
          <span>·</span>
          <span className="eng-notes-empty__kbd">F</span>
          <span>tag</span>
        </div>
      </div>
    </div>
  );
}
