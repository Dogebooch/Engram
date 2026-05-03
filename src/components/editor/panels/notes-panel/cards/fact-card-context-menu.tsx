"use client";

import * as React from "react";
import { Trash2Icon } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { deleteFact } from "@/lib/notes/insert";

interface MenuState {
  factId: string;
  x: number;
  y: number;
}

const MENU_WIDTH = 180;

/**
 * Card-level right-click menu. Listens for `engram:open-fact-card-menu`
 * dispatched by FactCard's onContextMenu. Outside-click + Esc close.
 *
 * Phase 5 ships with one item: Delete fact. Rename is reachable via the
 * inline-edit on the card name itself; Move-to-section can come later.
 */
export function FactCardContextMenu() {
  const [state, setState] = React.useState<MenuState | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<MenuState>).detail;
      if (!detail) return;
      setState(detail);
    };
    window.addEventListener(
      "engram:open-fact-card-menu",
      onOpen as EventListener,
    );
    return () =>
      window.removeEventListener(
        "engram:open-fact-card-menu",
        onOpen as EventListener,
      );
  }, []);

  React.useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setState(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [state]);

  const onDelete = React.useCallback(() => {
    if (!state) return;
    const s = useStore.getState();
    const cid = s.currentPicmonicId;
    if (!cid) return;
    const picmonic = s.picmonics[cid];
    if (!picmonic) return;
    const parsed = parseNotes(picmonic.notes);
    const next = deleteFact(picmonic.notes, parsed, state.factId);
    if (next !== picmonic.notes) s.setNotes(cid, next);
    setState(null);
  }, [state]);

  if (!state) return null;

  const top = Math.min(state.y, window.innerHeight - 80);
  const left = Math.max(8, Math.min(state.x, window.innerWidth - MENU_WIDTH - 8));

  return (
    <div
      ref={menuRef}
      className="eng-chip-menu"
      role="menu"
      style={{ top: top + 4, left, width: MENU_WIDTH }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="eng-chip-menu__item"
        data-destructive=""
        onClick={onDelete}
      >
        <span className="eng-chip-menu__icon" aria-hidden>
          <Trash2Icon className="size-3.5" />
        </span>
        <span className="eng-chip-menu__label">Delete fact</span>
      </button>
    </div>
  );
}
