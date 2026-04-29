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
  "? — this menu",
] as const;

export function useEditorKeybindings(): void {
  const toggleLeft = useStore((s) => s.toggleLeftCollapsed);
  const toggleRight = useStore((s) => s.toggleRightCollapsed);
  const createPicmonic = useStore((s) => s.createPicmonic);

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

  useKeybinding({ key: "n", mod: true }, onNew);
  useKeybinding({ key: "b", mod: true }, onToggleLeft);
  useKeybinding({ key: "\\", mod: true }, onToggleRight);
  useKeybinding({ key: "?", shift: true }, onHelp);
}
