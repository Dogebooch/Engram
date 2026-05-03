"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { saveCurrentPicmonicNow } from "@/lib/store/save-now";
import { parseNotes } from "@/lib/notes/parse";
import {
  insertFact,
  insertSectionAbove,
  moveFact,
  type FactDropTarget,
} from "@/lib/notes/insert";

// Help-overlay rendering moved to `<HelpDialog />`. Keep no inline copy here —
// the dialog owns the reference.

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}

export interface Keybinding {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

function matches(e: KeyboardEvent, b: Keybinding): boolean {
  if (e.key.toLowerCase() !== b.key.toLowerCase()) return false;
  const hasMod = e.ctrlKey || e.metaKey;
  if (b.mod !== undefined && b.mod !== hasMod) return false;
  if (b.shift !== undefined && b.shift !== e.shiftKey) return false;
  if (b.alt !== undefined && b.alt !== e.altKey) return false;
  return true;
}

export function useKeybinding(
  binding: Keybinding,
  handler: (e: KeyboardEvent) => void,
  opts: { allowInTypingFields?: boolean } = {},
): void {
  const { key, mod, shift, alt } = binding;
  const { allowInTypingFields = false } = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matches(e, { key, mod, shift, alt })) return;
      if (!allowInTypingFields && isTypingTarget(e.target)) return;
      handler(e);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [key, mod, shift, alt, allowInTypingFields, handler]);
}

function focusLibrarySearch() {
  window.dispatchEvent(new CustomEvent("engram:focus-library-search"));
}

export function useEditorKeybindings(): void {
  const toggleLeft = useStore((s) => s.toggleLeftCollapsed);
  const toggleRight = useStore((s) => s.toggleRightCollapsed);
  const setLeftCollapsed = useStore((s) => s.setLeftCollapsed);
  const createPicmonic = useStore((s) => s.createPicmonic);
  const deleteSymbols = useStore((s) => s.deleteSymbols);
  const duplicateSymbols = useStore((s) => s.duplicateSymbols);
  const reorderSymbol = useStore((s) => s.reorderSymbol);
  const clearSelection = useStore((s) => s.clearSelection);
  const groupSymbols = useStore((s) => s.groupSymbols);
  const ungroupSymbols = useStore((s) => s.ungroupSymbols);
  const openFactPicker = useStore((s) => s.openFactPicker);
  const closeFactPicker = useStore((s) => s.closeFactPicker);
  const closeContextMenu = useStore((s) => s.closeSymbolContextMenu);
  const requestSymbolDelete = useStore((s) => s.requestSymbolDelete);
  const cancelSymbolDelete = useStore((s) => s.cancelSymbolDelete);
  const selectAllSymbols = useStore((s) => s.selectAllSymbols);
  const enterPlayer = useStore((s) => s.enterPlayer);

  const onNew = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      createPicmonic();
    },
    [createPicmonic],
  );

  const onToggleLeft = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      toggleLeft();
    },
    [toggleLeft],
  );

  const onToggleRight = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      toggleRight();
    },
    [toggleRight],
  );

  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const onHelp = useCallback(() => {
    setHelpOpen(true);
  }, [setHelpOpen]);

  const onFocusSearch = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    setLeftCollapsed(false);
    focusLibrarySearch();
  }, [setLeftCollapsed]);

  const onDelete = useCallback(
    (e: KeyboardEvent) => {
      const s = useStore.getState();
      const ids = s.selectedSymbolIds;
      if (ids.length === 0) return;
      e.preventDefault();
      if (s.ui.confirmSymbolDelete) {
        requestSymbolDelete(ids);
      } else {
        deleteSymbols(ids);
      }
    },
    [deleteSymbols, requestSymbolDelete],
  );

  const onSelectAll = useCallback(
    (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (!s.currentPicmonicId) return;
      const total = s.picmonics[s.currentPicmonicId]?.canvas.symbols.length ?? 0;
      if (total === 0) return;
      e.preventDefault();
      selectAllSymbols();
    },
    [selectAllSymbols],
  );

  const onDuplicate = useCallback(
    (e: KeyboardEvent) => {
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) return;
      e.preventDefault();
      duplicateSymbols(ids);
    },
    [duplicateSymbols],
  );

  const onSendBack = useCallback(
    (e: KeyboardEvent) => {
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) return;
      e.preventDefault();
      for (const id of ids) reorderSymbol(id, "back");
    },
    [reorderSymbol],
  );

  const onBringForward = useCallback(
    (e: KeyboardEvent) => {
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) return;
      e.preventDefault();
      for (const id of ids) reorderSymbol(id, "forward");
    },
    [reorderSymbol],
  );

  const onSendToBack = useCallback(
    (e: KeyboardEvent) => {
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) return;
      e.preventDefault();
      for (const id of ids) reorderSymbol(id, "toBack");
    },
    [reorderSymbol],
  );

  const onBringToFront = useCallback(
    (e: KeyboardEvent) => {
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) return;
      e.preventDefault();
      for (const id of ids) reorderSymbol(id, "toFront");
    },
    [reorderSymbol],
  );

  const onEscape = useCallback(() => {
    const s = useStore.getState();
    // Esc ladder: help → delete-confirm → picker → context menu → clear selection.
    if (s.helpOpen) {
      setHelpOpen(false);
      return;
    }
    if (s.pendingSymbolDelete) {
      cancelSymbolDelete();
      return;
    }
    if (s.factPicker?.open) {
      closeFactPicker();
      return;
    }
    if (s.contextMenu) {
      closeContextMenu();
      return;
    }
    if (s.selectedSymbolIds.length > 0) {
      clearSelection();
    }
  }, [
    cancelSymbolDelete,
    clearSelection,
    closeContextMenu,
    closeFactPicker,
    setHelpOpen,
  ]);

  const onOpenFactPicker = useCallback(
    (e: KeyboardEvent) => {
      const s = useStore.getState();
      const ids = s.selectedSymbolIds;
      if (ids.length > 0) {
        e.preventDefault();
        openFactPicker(ids);
        return;
      }
      // No symbols selected — if a fact card has focus, create a new fact
      // in the same section as the focused one. Falls back to a toast when
      // nothing is focused.
      const cid = s.currentPicmonicId;
      const factId = s.lastActiveFactId;
      const picmonic = cid ? s.picmonics[cid] : null;
      if (cid && picmonic && factId) {
        e.preventDefault();
        const parsed = parseNotes(picmonic.notes);
        const sectionId = parsed.factsById.get(factId)?.sectionId ?? null;
        const r = insertFact(picmonic.notes, parsed, sectionId);
        s.setNotes(cid, r.newNotes);
        s.setCursorContext({ factId: r.factId, symbolIds: [] });
        return;
      }
      toast("Select a symbol or focus a Fact card first", {
        description: "Then press F to tag or to add a new Fact.",
        duration: 1800,
      });
      e.preventDefault();
    },
    [openFactPicker],
  );

  const onGroup = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length < 2) {
        toast("Select 2+ symbols to group", { duration: 1500 });
        return;
      }
      const groupId = groupSymbols(ids);
      if (groupId) {
        toast(`Grouped ${ids.length} symbols`, { duration: 1200 });
      }
    },
    [groupSymbols],
  );

  const onUngroup = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) return;
      ungroupSymbols(ids);
    },
    [ungroupSymbols],
  );

  const onEnterStudy = useCallback(
    (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.player.open) return; // player has its own M handler
      if (!s.currentPicmonicId) return;
      e.preventDefault();
      enterPlayer();
    },
    [enterPlayer],
  );

  // `+` while a Fact is focused (i.e. the sidebar tree shows it as the
  // active row) opens the symbol picker in `add-to-fact` mode. Falls back
  // to "no fact focused" toast so the user knows what's missing.
  const onAddSymbolToFact = useCallback((e: KeyboardEvent) => {
    const s = useStore.getState();
    if (!s.currentPicmonicId) return;
    if (s.symbolPicker !== null || s.factPicker?.open) return;
    const factId = s.lastActiveFactId;
    if (!factId) {
      toast("No Fact focused", {
        description: "Click a Fact in the outline first.",
        duration: 1600,
      });
      e.preventDefault();
      return;
    }
    e.preventDefault();
    s.openSymbolPicker({ mode: "add-to-fact", factId });
  }, []);

  // `s` (no modifier) → open the symbol picker for the focused Fact card.
  // Same payload as `+`, but a single keystroke for the cards-panel flow
  // where the user already has a card focused.
  const onAddSymbolPlainS = useCallback((e: KeyboardEvent) => {
    const s = useStore.getState();
    if (!s.currentPicmonicId) return;
    if (s.symbolPicker !== null || s.factPicker?.open) return;
    const factId = s.lastActiveFactId;
    if (!factId) return; // silent — user can use `+` for an explicit toast
    e.preventDefault();
    s.openSymbolPicker({ mode: "add-to-fact", factId });
  }, []);

  // `#` (Shift+3) → insert a section break above the focused fact card.
  // The focused fact becomes the first fact of the new section.
  const onInsertSectionAbove = useCallback((e: KeyboardEvent) => {
    const s = useStore.getState();
    const cid = s.currentPicmonicId;
    if (!cid) return;
    const picmonic = s.picmonics[cid];
    if (!picmonic) return;
    const factId = s.lastActiveFactId;
    if (!factId) return;
    e.preventDefault();
    const parsed = parseNotes(picmonic.notes);
    const r = insertSectionAbove(picmonic.notes, parsed, factId);
    if (r.newNotes !== picmonic.notes) s.setNotes(cid, r.newNotes);
  }, []);

  // Cmd/Ctrl+ArrowUp / +ArrowDown → move the focused fact up/down in the
  // document. Crosses section boundaries (composes with `moveFact`'s
  // section-end target for cross-section drops).
  const onMoveFactUp = useCallback(
    (e: KeyboardEvent) => moveFocusedFact(e, "up"),
    [],
  );
  const onMoveFactDown = useCallback(
    (e: KeyboardEvent) => moveFocusedFact(e, "down"),
    [],
  );

  // ⌘S / Ctrl+S — flush any pending debounced save and write now.
  // preventDefault stops the browser's "Save Page As…" dialog.
  const onExplicitSave = useCallback((e: KeyboardEvent) => {
    const s = useStore.getState();
    if (!s.currentPicmonicId) return;
    e.preventDefault();
    flushPendingSave();
    void saveCurrentPicmonicNow();
  }, []);

  useKeybinding({ key: "n", mod: true }, onNew);
  useKeybinding({ key: "b", mod: true }, onToggleLeft);
  useKeybinding({ key: "\\", mod: true }, onToggleRight);
  useKeybinding({ key: "?", shift: true }, onHelp);
  useKeybinding({ key: "/" }, onFocusSearch);
  useKeybinding({ key: "Delete" }, onDelete);
  useKeybinding({ key: "Backspace" }, onDelete);
  useKeybinding({ key: "a", mod: true, shift: false }, onSelectAll);
  useKeybinding({ key: "d", mod: true }, onDuplicate);
  useKeybinding({ key: "[", mod: false, shift: false }, onSendBack);
  useKeybinding({ key: "]", mod: false, shift: false }, onBringForward);
  useKeybinding({ key: "{", shift: true }, onSendToBack);
  useKeybinding({ key: "}", shift: true }, onBringToFront);
  useKeybinding({ key: "Escape" }, onEscape);
  useKeybinding({ key: "f", mod: false, shift: false }, onOpenFactPicker);
  useKeybinding({ key: "g", mod: true, shift: false }, onGroup);
  useKeybinding({ key: "g", mod: true, shift: true }, onUngroup);
  useKeybinding({ key: "m", mod: false, shift: false, alt: false }, onEnterStudy);
  useKeybinding({ key: "s", mod: true, shift: false }, onExplicitSave, {
    allowInTypingFields: true,
  });
  // `+` (Shift+= on US layouts) → open symbol picker for the focused Fact.
  useKeybinding({ key: "+", mod: false, shift: true }, onAddSymbolToFact);
  // Cards-panel keys: bare `s`, `#` (Shift+3), Cmd/Ctrl+↑/↓.
  useKeybinding({ key: "s", mod: false, shift: false }, onAddSymbolPlainS);
  useKeybinding({ key: "#", mod: false, shift: true }, onInsertSectionAbove);
  useKeybinding({ key: "ArrowUp", mod: true, shift: false }, onMoveFactUp);
  useKeybinding({ key: "ArrowDown", mod: true, shift: false }, onMoveFactDown);
}

/**
 * Move the focused fact up or down in document order. Resolves the previous
 * or next sibling across section boundaries using the parsed projection.
 * No-op when no card is focused or the fact is already at the doc edge.
 */
function moveFocusedFact(e: KeyboardEvent, direction: "up" | "down"): void {
  const s = useStore.getState();
  const cid = s.currentPicmonicId;
  if (!cid) return;
  const picmonic = s.picmonics[cid];
  if (!picmonic) return;
  const factId = s.lastActiveFactId;
  if (!factId) return;
  const parsed = parseNotes(picmonic.notes);
  const fact = parsed.factsById.get(factId);
  if (!fact) return;

  // Build the flat document-order list of facts.
  const flat: { factId: string; sectionId: string | null }[] = [];
  for (const f of parsed.rootFacts) flat.push({ factId: f.factId, sectionId: null });
  for (const sec of parsed.sections) {
    for (const f of sec.facts) flat.push({ factId: f.factId, sectionId: sec.sectionId });
  }
  const idx = flat.findIndex((f) => f.factId === factId);
  if (idx === -1) return;

  let target: FactDropTarget | null = null;
  if (direction === "up") {
    if (idx === 0) return;
    const prev = flat[idx - 1];
    target = { kind: "before-fact", factId: prev.factId };
  } else {
    if (idx === flat.length - 1) return;
    // Skip past the immediate-next sibling so we land AFTER it.
    const after = flat[idx + 1];
    if (idx + 2 < flat.length) {
      target = { kind: "before-fact", factId: flat[idx + 2].factId };
    } else {
      // After the last fact — append to its section (or doc end if root).
      target = { kind: "section-end", sectionId: after.sectionId };
    }
  }

  e.preventDefault();
  const next = moveFact(picmonic.notes, parsed, factId, target);
  if (next !== picmonic.notes) s.setNotes(cid, next);
}
