"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, usePicmonic } from "@/lib/store/hooks";
import { pauseHistory, resumeHistory } from "@/lib/store/temporal";
import { lintGutter } from "@codemirror/lint";
import { parseNotes } from "@/lib/notes/parse";
import { lintNotes } from "@/lib/notes/lint";
import { findMissingOutlines } from "@/lib/canvas/missing-outlines";
import { buildBaseExtensions } from "@/lib/notes/codemirror/setup";
import {
  factHeadingExtension,
  setFactHeadingOnAddToFact,
} from "@/lib/notes/codemirror/fact-heading-extension";
import { symbolChipExtension } from "@/lib/notes/codemirror/sym-token-extension";
import { buildBulletLinterExtension } from "@/lib/notes/codemirror/lint-extension";
import { transientHighlightField } from "./transient-highlight";
import { NotesBreadcrumb } from "./breadcrumb";
import { useCodeMirror } from "./use-codemirror";
import { useSymbolResolver } from "./use-symbol-resolver";
import { useSyncCanvasToEditor } from "./use-sync-canvas-to-editor";
import { useEditorToCanvasSync } from "./use-sync-editor-to-canvas";

export function NotesPanel() {
  const picmonic = usePicmonic();
  const currentId = useCurrentPicmonicId();
  const setNotes = useStore((s) => s.setNotes);

  const value = picmonic?.notes ?? "";
  const parsed = React.useMemo(() => parseNotes(value), [value]);

  const { onCursorChange, parsedRef, breadcrumb } = useEditorToCanvasSync();
  React.useEffect(() => {
    parsedRef.current = parsed;
  }, [parsed, parsedRef]);

  React.useEffect(() => {
    setFactHeadingOnAddToFact((factId: string) => {
      const state = useStore.getState();
      state.setAddSymbolTargetFact(factId);
      state.setLeftCollapsed(false);
      window.dispatchEvent(new CustomEvent("engram:focus-library-search"));
    });
  }, []);

  const handleChange = React.useCallback(
    (next: string) => {
      if (!currentId) return;
      // Typing in CodeMirror is owned by CM's own history extension, not by
      // zundo. Pause the temporal middleware around the setNotes write so
      // keystrokes don't double-record into the canvas history stack.
      pauseHistory();
      try {
        setNotes(currentId, next);
      } finally {
        resumeHistory();
      }
    },
    [currentId, setNotes],
  );

  const extensions = React.useMemo(
    () => [
      ...buildBaseExtensions(),
      symbolChipExtension,
      factHeadingExtension,
      transientHighlightField,
      lintGutter({ tooltipFilter: () => [] }),
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

  const missingOutlines = React.useMemo(
    () => findMissingOutlines(value, parsed, picmonic?.canvas.symbols ?? []),
    [value, parsed, picmonic],
  );

  const startOutlining = React.useCallback(() => {
    if (missingOutlines.length === 0) return;
    const ids = missingOutlines.map((m) => m.symbolId);
    const status = useStore.getState().startOutlineWalkthrough(ids);
    // No background yet — route the first symbol through the confirm dialog's
    // background picker; the rest can be walked once a background is set.
    if (status === "needs-backdrop") {
      useStore.getState().requestOutlineConfirm(ids[0]);
    }
  }, [missingOutlines]);

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
          {missingOutlines.length > 0 && (
            <button
              type="button"
              onClick={startOutlining}
              title="Draw outlines for symbols that don't have one yet"
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.22em] text-amber-500/80 hover:text-amber-400"
            >
              <span className="size-[5px] rounded-full bg-amber-500" />
              {missingOutlines.length} need outline
              {missingOutlines.length === 1 ? "" : "s"}
            </button>
          )}
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
                  {lintCounts.warnings} issue
                  {lintCounts.warnings === 1 ? "" : "s"}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
      <NotesBreadcrumb breadcrumb={breadcrumb} />
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
            To get started, add a section by typing # &apos;Section Name&apos; in
            the Markdown column.
          </span>
        </div>
        <div className="eng-notes-empty__rule" aria-hidden />
        <div className="eng-notes-empty__keys">
          <span>Then add a ## fact under it, and tag a symbol.</span>
        </div>
      </div>
    </div>
  );
}
