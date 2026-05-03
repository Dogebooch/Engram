"use client";

import * as React from "react";
import { ReplaceIcon, CrosshairIcon, XIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { untagSymbolFromFact } from "@/lib/notes/insert";
import type { ParsedSymbolRef } from "@/lib/notes/types";

interface MenuState {
  uuid: string;
  offset: number;
  x: number;
  y: number;
  broken: boolean;
}

interface OpenDetail {
  uuid: string;
  offset: number;
  x: number;
  y: number;
  anchor?: unknown;
}

const MENU_WIDTH = 220;
const MENU_VPAD = 4;

/**
 * Right-click menu for `{sym:UUID}` chips inside CodeMirror (raw mode).
 * Items: Replace · Reveal on canvas · Untag from this Fact.
 *
 * Mounts globally; listens for `engram:open-chip-context-menu`.
 */
export function ChipContextMenu() {
  const [state, setState] = React.useState<MenuState | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      if (!detail) return;
      const s = useStore.getState();
      const cid = s.currentPicmonicId;
      const layers = cid ? s.picmonics[cid]?.canvas.symbols ?? [] : [];
      const broken = !layers.some((sy) => sy.id === detail.uuid);
      setState({
        uuid: detail.uuid,
        offset: detail.offset,
        x: detail.x,
        y: detail.y,
        broken,
      });
    };
    window.addEventListener(
      "engram:open-chip-context-menu",
      onOpen as EventListener,
    );
    return () =>
      window.removeEventListener(
        "engram:open-chip-context-menu",
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

  const close = React.useCallback(() => setState(null), []);

  const onReplace = React.useCallback(() => {
    if (!state) return;
    useStore.getState().openSymbolPicker({
      mode: "replace",
      chipUuid: state.uuid,
    });
    close();
  }, [state, close]);

  const onReveal = React.useCallback(() => {
    if (!state) return;
    const s = useStore.getState();
    s.setLastSyncSource("editor");
    s.setSelectedSymbolIds([state.uuid]);
    close();
  }, [state, close]);

  const onUntag = React.useCallback(() => {
    if (!state) return;
    const s = useStore.getState();
    const cid = s.currentPicmonicId;
    if (!cid) return close();
    const picmonic = s.picmonics[cid];
    if (!picmonic) return close();
    const parsed = parseNotes(picmonic.notes);
    let ref: ParsedSymbolRef | null = null;
    for (const fact of parsed.factsById.values()) {
      for (const r of fact.symbolRefs) {
        if (r.symbolId === state.uuid && r.start === state.offset) {
          ref = r;
          break;
        }
      }
      if (ref) break;
    }
    if (!ref) return close();
    const next = untagSymbolFromFact(picmonic.notes, ref);
    if (next !== picmonic.notes) s.setNotes(cid, next);
    close();
  }, [state, close]);

  if (!state) return null;

  const top = Math.min(state.y, window.innerHeight - 200);
  const left = Math.max(
    8,
    Math.min(state.x, window.innerWidth - MENU_WIDTH - 8),
  );

  return (
    <div
      ref={menuRef}
      className="eng-chip-menu"
      role="menu"
      style={{ top: top + MENU_VPAD, left, width: MENU_WIDTH }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuItem
        icon={<ReplaceIcon className="size-3.5" />}
        label="Replace symbol…"
        onClick={onReplace}
      />
      {!state.broken && (
        <MenuItem
          icon={<CrosshairIcon className="size-3.5" />}
          label="Reveal on canvas"
          onClick={onReveal}
        />
      )}
      <MenuItem
        icon={<XIcon className="size-3.5" />}
        label="Untag from this Fact"
        onClick={onUntag}
      />
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function MenuItem({ icon, label, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="eng-chip-menu__item"
      onClick={onClick}
    >
      <span className="eng-chip-menu__icon" aria-hidden>
        {icon}
      </span>
      <span className="eng-chip-menu__label">{label}</span>
    </button>
  );
}
