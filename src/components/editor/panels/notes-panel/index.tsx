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
import { NotesBreadcrumb } from "./breadcrumb";
import { NotesTree } from "./notes-tree";
import { useCodeMirror } from "./use-codemirror";
import { useSymbolResolver } from "./use-symbol-resolver";
import { useSyncCanvasToEditor } from "./use-sync-canvas-to-editor";
import { useEditorToCanvasSync } from "./use-sync-editor-to-canvas";
import { cn } from "@/lib/utils";

export function NotesPanel() {
  const picmonic = usePicmonic();
  const currentId = useCurrentPicmonicId();
  const setNotes = useStore((s) => s.setNotes);
  const mode = useStore((s) => s.ui.notesPanelMode);
  const setMode = useStore((s) => s.setNotesPanelMode);

  const value = picmonic?.notes ?? "";
  const symbols = picmonic?.canvas.symbols ?? EMPTY_SYMBOLS;
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

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work everywhere in the right panel by
  // routing to CodeMirror's history. The editor itself catches the keys
  // when it has focus (its own `historyKeymap` fires); this listener is
  // the global fallback for the Outline tree, where focus is on a button
  // and the document gets the keydown.
  //
  // Tree mutations (insertSection / insertFact) call setNotes; the value
  // prop flowing back to CodeMirror in `useCodeMirror` lands as a single
  // full-doc-replace transaction — already recorded in history. So undo
  // here just reverses that transaction and the store re-syncs through
  // the editor's onChange.
  React.useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "z") return;
      // When focus is in the editor itself, let CodeMirror's keymap fire.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      const cmd = e.shiftKey ? redo : undo;
      cmd({ state: view.state, dispatch: view.dispatch });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view]);

  const isEmpty = value.trim().length === 0;

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          notes
        </span>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      <NotesBreadcrumb breadcrumb={breadcrumb} />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Outline tree — primary surface. */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden",
            mode === "outline" ? "visible" : "invisible pointer-events-none",
          )}
          aria-hidden={mode !== "outline"}
        >
          {currentId ? (
            <NotesTree
              notes={value}
              parsed={parsed}
              symbols={symbols}
              picmonicId={currentId}
            />
          ) : null}
        </div>
        {/* Raw markdown editor — escape hatch. Stays mounted so CodeMirror
            keeps its history + sync hooks alive even when hidden. */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden",
            mode === "raw" ? "visible" : "invisible pointer-events-none",
          )}
          aria-hidden={mode !== "raw"}
        >
          <div
            ref={setHostRef}
            className="eng-notes-host h-full w-full overflow-hidden"
            data-eng-notes-editor
          />
          {isEmpty && <NotesEmptyOverlay />}
        </div>
      </div>
    </div>
  );
}

interface ModeToggleProps {
  mode: "outline" | "raw";
  onChange: (mode: "outline" | "raw") => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="eng-notes-mode-toggle" role="radiogroup" aria-label="Notes view">
      <button
        type="button"
        role="radio"
        aria-checked={mode === "outline"}
        data-active={mode === "outline"}
        className="eng-notes-mode-toggle__btn"
        onClick={() => onChange("outline")}
      >
        Outline
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "raw"}
        data-active={mode === "raw"}
        className="eng-notes-mode-toggle__btn"
        onClick={() => onChange("raw")}
      >
        Raw
      </button>
    </div>
  );
}

const EMPTY_SYMBOLS: readonly never[] = [];

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
