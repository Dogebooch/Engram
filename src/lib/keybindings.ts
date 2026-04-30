"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

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

const HELP_LINES = [
  "⌘/Ctrl+N — new Picmonic",
  "⌘/Ctrl+B — toggle library",
  "⌘/Ctrl+\\ — toggle notes",
  "/ — focus library search",
  "Click symbol — select (Shift+click for multi, Alt+click bypasses group)",
  "F — tag selected with Fact (palette)",
  "Right-click symbol — context menu",
  "Drag symbol onto ## heading — tag",
  "⌘/Ctrl+G — group selection",
  "⇧⌘/⇧Ctrl+G — ungroup",
  "Delete / Backspace — remove selected",
  "⌘/Ctrl+D — duplicate selected",
  "[ ] — send back / bring forward",
  "{ } — to back / to front",
  "M — study mode (cycles Hotspot ↔ Sequential)",
  "← / → — prev / next fact (in Sequential)",
  "1–9 — jump to fact N (in study mode)",
  "Esc — close menu/picker, exit study, then clear selection",
  "? — this menu",
] as const;

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

  const onHelp = useCallback(() => {
    toast("Shortcuts", {
      description: HELP_LINES.join("\n"),
    });
  }, []);

  const onFocusSearch = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    setLeftCollapsed(false);
    focusLibrarySearch();
  }, [setLeftCollapsed]);

  const onDelete = useCallback(
    (e: KeyboardEvent) => {
      const ids = useStore.getState().selectedSymbolIds;
      if (ids.length === 0) return;
      e.preventDefault();
      deleteSymbols(ids);
    },
    [deleteSymbols],
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
    // Esc ladder: close picker → close context menu → clear selection.
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
  }, [clearSelection, closeContextMenu, closeFactPicker]);

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

  useKeybinding({ key: "n", mod: true }, onNew);
  useKeybinding({ key: "b", mod: true }, onToggleLeft);
  useKeybinding({ key: "\\", mod: true }, onToggleRight);
  useKeybinding({ key: "?", shift: true }, onHelp);
  useKeybinding({ key: "/" }, onFocusSearch);
  useKeybinding({ key: "Delete" }, onDelete);
  useKeybinding({ key: "Backspace" }, onDelete);
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
}
