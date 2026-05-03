"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import type { SymbolContextMenuState } from "@/lib/store/slices/interactions-slice";

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform || "";
  return /Mac|iPhone|iPad|iPod/i.test(p);
}

/**
 * Right-click menu for a Konva symbol. Mounted only while a `contextMenu`
 * is active in the store, so the Base UI warning for the off-screen anchor
 * trigger fires at most once per open. Position is set via a 1×1
 * fixed-positioned `<button>` used as the menu's anchor.
 */
export function SymbolContextMenu() {
  const contextMenu = useStore((s) => s.contextMenu);
  if (!contextMenu) return null;
  return <SymbolContextMenuInner contextMenu={contextMenu} />;
}

function SymbolContextMenuInner({
  contextMenu,
}: {
  contextMenu: SymbolContextMenuState;
}) {
  const closeContextMenu = useStore((s) => s.closeSymbolContextMenu);
  const openFactPicker = useStore((s) => s.openFactPicker);
  const openReplacePicker = useStore((s) => s.openReplacePicker);
  const selectedSymbolIds = useStore((s) => s.selectedSymbolIds);
  const groupSymbols = useStore((s) => s.groupSymbols);
  const ungroupSymbols = useStore((s) => s.ungroupSymbols);
  const reorderSymbol = useStore((s) => s.reorderSymbol);
  const duplicateSymbols = useStore((s) => s.duplicateSymbols);
  const deleteSymbols = useStore((s) => s.deleteSymbols);
  const requestSymbolDelete = useStore((s) => s.requestSymbolDelete);
  const groupForSelection = useStore((s) => {
    const cid = s.currentPicmonicId;
    if (!cid) return false;
    const p = s.picmonics[cid];
    if (!p) return false;
    const idSet = new Set(s.selectedSymbolIds);
    return p.canvas.symbols.some(
      (sy) => idSet.has(sy.id) && sy.groupId !== null,
    );
  });

  const mac = isMac();
  const cmd = mac ? "⌘" : "Ctrl";
  const { x, y, symbolId } = contextMenu;

  const targetIds =
    selectedSymbolIds.length > 0 ? selectedSymbolIds : [symbolId];

  const tagWithFact = () => {
    closeContextMenu();
    openFactPicker(targetIds);
  };

  const onReplace = () => {
    closeContextMenu();
    openReplacePicker(x, y, symbolId);
  };

  const canReplace = targetIds.length === 1;

  const onGroup = () => {
    closeContextMenu();
    if (selectedSymbolIds.length < 2) return;
    groupSymbols(selectedSymbolIds);
  };

  const onUngroup = () => {
    closeContextMenu();
    ungroupSymbols(selectedSymbolIds);
  };

  const onBringToFront = () => {
    closeContextMenu();
    for (const id of targetIds) reorderSymbol(id, "toFront");
  };

  const onSendToBack = () => {
    closeContextMenu();
    for (const id of targetIds) reorderSymbol(id, "toBack");
  };

  const onDuplicate = () => {
    closeContextMenu();
    duplicateSymbols(targetIds);
  };

  const onDelete = () => {
    closeContextMenu();
    if (useStore.getState().ui.confirmSymbolDelete) {
      requestSymbolDelete(targetIds);
    } else {
      deleteSymbols(targetIds);
    }
  };

  const canGroup = selectedSymbolIds.length >= 2;
  const canUngroup = groupForSelection;

  return (
    <DropdownMenu
      open
      onOpenChange={(o) => {
        if (!o) closeContextMenu();
      }}
    >
      <DropdownMenuTrigger
        aria-hidden
        tabIndex={-1}
        style={{
          position: "fixed",
          left: x,
          top: y,
          width: 1,
          height: 1,
          padding: 0,
          margin: 0,
          border: 0,
          background: "transparent",
          pointerEvents: "none",
          opacity: 0,
        }}
      />
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="eng-symbol-context-menu min-w-56"
      >
        <DropdownMenuItem onClick={onReplace} disabled={!canReplace}>
          Replace symbol…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={tagWithFact}>
          Tag with Fact…
          <DropdownMenuShortcut>F</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onGroup} disabled={!canGroup}>
          Group selection
          <DropdownMenuShortcut>{cmd} G</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onUngroup} disabled={!canUngroup}>
          Ungroup
          <DropdownMenuShortcut>⇧{cmd} G</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onBringToFront}>
          Bring to Front
          <DropdownMenuShortcut>{"}"}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSendToBack}>
          Send to Back
          <DropdownMenuShortcut>{"{"}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDuplicate}>
          Duplicate
          <DropdownMenuShortcut>{cmd} D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Delete
          <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
