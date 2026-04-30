"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface HotspotContextMenuState {
  factId: string;
  isOverride: boolean;
  x: number;
  y: number;
}

interface HotspotContextMenuProps {
  state: HotspotContextMenuState | null;
  onResetPosition: (factId: string) => void;
  onClose: () => void;
}

export function HotspotContextMenu({
  state,
  onResetPosition,
  onClose,
}: HotspotContextMenuProps) {
  if (!state) return null;
  const { factId, isOverride, x, y } = state;

  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
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
        className="eng-symbol-context-menu min-w-48"
      >
        <DropdownMenuItem
          disabled={!isOverride}
          onClick={() => {
            onResetPosition(factId);
            onClose();
          }}
        >
          Reset position
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
