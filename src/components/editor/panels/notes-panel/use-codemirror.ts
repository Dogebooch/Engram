"use client";

import * as React from "react";
import { EditorState, Transaction, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

interface UseCodeMirrorArgs {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (view: EditorView) => void;
  extensions: Extension[];
  onView?: (view: EditorView | null) => void;
}

export function useCodeMirror({
  value,
  onChange,
  onCursorChange,
  extensions,
  onView,
}: UseCodeMirrorArgs): {
  setHostRef: (el: HTMLDivElement | null) => void;
  view: EditorView | null;
} {
  const [view, setView] = React.useState<EditorView | null>(null);
  const programmaticUpdateRef = React.useRef(false);
  const lastValueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  const onCursorChangeRef = React.useRef(onCursorChange);
  const onViewRef = React.useRef(onView);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  React.useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);
  React.useEffect(() => {
    onViewRef.current = onView;
  }, [onView]);

  const setHostRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) {
        setView((prev) => {
          if (prev) {
            prev.destroy();
            onViewRef.current?.(null);
          }
          return null;
        });
        return;
      }

      const updateListener = EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          const next = u.state.doc.toString();
          lastValueRef.current = next;
          if (!programmaticUpdateRef.current) {
            onChangeRef.current(next);
          }
        }
        programmaticUpdateRef.current = false;
        if (u.selectionSet || u.docChanged || u.focusChanged) {
          onCursorChangeRef.current?.(u.view);
        }
      });

      const editor = new EditorView({
        state: EditorState.create({
          doc: lastValueRef.current,
          extensions: [...extensions, updateListener],
        }),
        parent: el,
      });
      setView(editor);
      onViewRef.current?.(editor);
    },
    [extensions],
  );

  React.useEffect(() => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) {
      lastValueRef.current = value;
      return;
    }
    programmaticUpdateRef.current = true;
    lastValueRef.current = value;
    // External writes (canvas-side mutations, zundo undo restoring notes) must
    // NOT enter CM's own history — otherwise CM's Ctrl+Z would walk back over
    // a programmatic restoration and desync notes from canvas.
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [view, value]);

  return { setHostRef, view };
}
