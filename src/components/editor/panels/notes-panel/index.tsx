"use client";

import * as React from "react";
import { redo, undo } from "@codemirror/commands";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId, usePicmonic } from "@/lib/store/hooks";
import { parseNotes } from "@/lib/notes/parse";
import { buildBaseExtensions } from "@/lib/notes/codemirror/setup";
import { factHeadingExtension } from "@/lib/notes/codemirror/fact-heading-extension";
import { symbolChipExtension } from "@/lib/notes/codemirror/sym-token-extension";
import { isTypingTarget } from "@/lib/keybindings";
import { transientHighlightField } from "./transient-highlight";
import { NotesCards } from "./cards/notes-cards";
import { useCodeMirror } from "./use-codemirror";
import { useSymbolResolver } from "./use-symbol-resolver";
import { useSyncCanvasToCards } from "./use-sync-canvas-to-cards";
import { useSyncCanvasToEditor } from "./use-sync-canvas-to-editor";
import { useEditorToCanvasSync } from "./use-sync-editor-to-canvas";

export function NotesPanel() {
  const picmonic = usePicmonic();
  const currentId = useCurrentPicmonicId();
  const setNotes = useStore((s) => s.setNotes);

  const value = picmonic?.notes ?? "";
  const symbols = picmonic?.canvas.symbols ?? EMPTY_SYMBOLS;
  const parsed = React.useMemo(() => parseNotes(value), [value]);

  // Cursor-context tracking from CM still feeds `lastActiveFactId` etc. The
  // breadcrumb derived from this hook is no longer rendered; the cards ARE
  // the structure.
  const { onCursorChange, parsedRef } = useEditorToCanvasSync();
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
    ],
    [],
  );

  // CodeMirror is mounted in an offscreen host so its history records every
  // `setNotes` write (the value-prop reconciliation lands as one transaction
  // per write). The global Ctrl+Z handler below routes undo/redo to that
  // history. No raw-markdown surface is rendered in v1 of the cards panel.
  const { setHostRef, view } = useCodeMirror({
    value,
    onChange: handleChange,
    onCursorChange,
    extensions,
  });

  useSymbolResolver(view);
  useSyncCanvasToEditor(view, parsed);
  useSyncCanvasToCards(parsed);

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z anywhere in the right panel route to
  // CodeMirror's history. Card mutations call setNotes which CM reconciles
  // as a full-doc-replace (one history entry); undo here reverses it and
  // the store re-syncs through CM's onChange.
  React.useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "z") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      const cmd = e.shiftKey ? redo : undo;
      cmd({ state: view.state, dispatch: view.dispatch });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view]);

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          notes
        </span>
      </div>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {currentId ? (
          <NotesCards
            notes={value}
            parsed={parsed}
            symbols={symbols}
            picmonicId={currentId}
          />
        ) : null}
        {/* Offscreen CodeMirror — keeps history alive for Ctrl+Z without
            rendering a visible editor. Phase 1 takes this on faith; if CM
            stops recording when offscreen, switch to a sub-pixel visible
            host instead. */}
        <div
          ref={setHostRef}
          aria-hidden
          className="eng-notes-host"
          data-eng-notes-editor
          style={{
            position: "absolute",
            left: -9999,
            top: 0,
            width: 1,
            height: 1,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

const EMPTY_SYMBOLS: readonly never[] = [];
