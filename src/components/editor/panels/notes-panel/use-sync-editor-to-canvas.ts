"use client";

import * as React from "react";
import type { EditorView } from "@codemirror/view";
import { useStore } from "@/lib/store";
import {
  findFactAtOffset,
  findSymbolRefsOnLine,
} from "@/lib/notes/parse";
import type { ParsedNotes } from "@/lib/notes/types";

export interface CursorBreadcrumb {
  factId: string | null;
  factName: string | null;
  sectionName: string | null;
}

export function deriveCursorContext(
  view: EditorView,
  parsed: ParsedNotes,
): { factId: string | null; symbolIds: string[]; bc: CursorBreadcrumb } {
  const head = view.state.selection.main.head;
  const fact = findFactAtOffset(parsed, head);
  const factId = fact?.factId ?? null;
  const lineInfo = view.state.doc.lineAt(head);
  const refsOnLine = findSymbolRefsOnLine(parsed, lineInfo.number);
  const symbolIds = refsOnLine.map((r) => r.symbolId);
  return {
    factId,
    symbolIds,
    bc: {
      factId,
      factName: fact?.name ?? null,
      sectionName: fact?.sectionName ?? null,
    },
  };
}

export function useEditorToCanvasSync(): {
  onCursorChange: (view: EditorView) => void;
  parsedRef: React.MutableRefObject<ParsedNotes | null>;
  breadcrumb: CursorBreadcrumb;
} {
  const setCursorContext = useStore((s) => s.setCursorContext);
  const setLastSyncSource = useStore((s) => s.setLastSyncSource);
  const parsedRef = React.useRef<ParsedNotes | null>(null);
  const [breadcrumb, setBreadcrumb] = React.useState<CursorBreadcrumb>({
    factId: null,
    factName: null,
    sectionName: null,
  });
  const lastFactIdRef = React.useRef<string | null>(null);
  const lastSymbolKeyRef = React.useRef<string>("");

  const onCursorChange = React.useCallback(
    (view: EditorView) => {
      const parsed = parsedRef.current;
      if (!parsed) return;
      const { factId, symbolIds, bc } = deriveCursorContext(view, parsed);
      const symbolKey = symbolIds.join(",");
      const factChanged = factId !== lastFactIdRef.current;
      const symbolsChanged = symbolKey !== lastSymbolKeyRef.current;
      if (!factChanged && !symbolsChanged) return;
      lastFactIdRef.current = factId;
      lastSymbolKeyRef.current = symbolKey;
      setCursorContext({ factId, symbolIds });
      setLastSyncSource("editor");
      if (
        bc.factName !== breadcrumb.factName ||
        bc.sectionName !== breadcrumb.sectionName
      ) {
        setBreadcrumb(bc);
      }
    },
    [setCursorContext, setLastSyncSource, breadcrumb],
  );

  return { onCursorChange, parsedRef, breadcrumb };
}
