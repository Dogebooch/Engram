"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { cancelMarqueeIfActive } from "@/components/editor/canvas/canvas-stage";
import { useStore } from "@/lib/store";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { saveCurrentPicmonicNow } from "@/lib/store/save-now";
import { getTemporal } from "@/lib/store/temporal";

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
  const closeReplacePicker = useStore((s) => s.closeReplacePicker);
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
    // Esc ladder: help → delete-confirm → fact picker → replace picker →
    // context menu → in-flight marquee → clear selection.
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
    if (s.replacePicker) {
      closeReplacePicker();
      return;
    }
    if (s.contextMenu) {
      closeContextMenu();
      return;
    }
    if (cancelMarqueeIfActive()) return;
    if (s.selectedSymbolIds.length > 0) {
      clearSelection();
    }
  }, [
    cancelSymbolDelete,
    clearSelection,
    closeContextMenu,
    closeFactPicker,
    closeReplacePicker,
    setHelpOpen,
  ]);

  const onOpenFactPicker = useCallback(
    (e: KeyboardEvent) => {
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) {
        toast("Select a symbol first", {
          description: "Then press F to tag with a Fact.",
          duration: 1800,
        });
        e.preventDefault();
        return;
      }
      e.preventDefault();
      openFactPicker(ids);
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

  // ⌘S / Ctrl+S — flush any pending debounced save and write now.
  // preventDefault stops the browser's "Save Page As…" dialog.
  const onExplicitSave = useCallback((e: KeyboardEvent) => {
    const s = useStore.getState();
    if (!s.currentPicmonicId) return;
    e.preventDefault();
    flushPendingSave();
    void saveCurrentPicmonicNow();
  }, []);

  // Cross-pane atomic undo/redo. CodeMirror's own historyKeymap handles Ctrl+Z
  // when notes pane is focused (via allowInTypingFields: false default below);
  // these handlers fire only when the canvas / topbar / nothing is focused, and
  // call into zundo's temporal history for the canvas + coupled-notes stack.
  const onUndo = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    const t = getTemporal();
    if (t.pastStates.length === 0) {
      toast("Nothing to undo", { duration: 900 });
      return;
    }
    t.undo();
  }, []);

  const onRedo = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    const t = getTemporal();
    if (t.futureStates.length === 0) {
      toast("Nothing to redo", { duration: 900 });
      return;
    }
    t.redo();
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
  // Undo: Ctrl/Cmd+Z. Redo: Ctrl/Cmd+Shift+Z (primary) and Ctrl+Y (Win/Linux
  // muscle memory). Default `allowInTypingFields: false` ensures these don't
  // fire while typing in CodeMirror — CM's native historyKeymap handles the
  // notes pane.
  useKeybinding({ key: "z", mod: true, shift: false }, onUndo);
  useKeybinding({ key: "z", mod: true, shift: true }, onRedo);
  useKeybinding({ key: "y", mod: true, shift: false }, onRedo);
}
