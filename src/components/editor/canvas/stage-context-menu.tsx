"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  imageFilesFromClipboardApi,
  placeImageFileAsBackdrop,
  placeImageFilesAsCanvasSymbols,
} from "@/lib/clipboard/paste-image";
import { useStore } from "@/lib/store";
import type { StageContextMenuState } from "@/lib/store/slices/interactions-slice";

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform || "";
  return /Mac|iPhone|iPad|iPod/i.test(p);
}

/**
 * Right-click menu for empty canvas area (no symbol under the cursor). For
 * now this carries one contextual paste action: image clipboard data becomes
 * the backdrop when the scene has none, otherwise it lands as a symbol.
 */
export function StageContextMenu() {
  const stageContextMenu = useStore((s) => s.stageContextMenu);
  if (!stageContextMenu) return null;
  return <StageContextMenuInner stageContextMenu={stageContextMenu} />;
}

function StageContextMenuInner({
  stageContextMenu,
}: {
  stageContextMenu: StageContextMenuState;
}) {
  const closeStageContextMenu = useStore((s) => s.closeStageContextMenu);
  const hasBackdrop = useStore((s) => {
    const cid = s.currentPicmonicId;
    return cid ? !!s.picmonics[cid]?.canvas.backdrop?.uploadedBlobId : false;
  });
  const { x, y, stageX, stageY } = stageContextMenu;

  const onPaste = async () => {
    closeStageContextMenu();
    const files = await imageFilesFromClipboardApi();
    if (files.length === 0) {
      toast.error("No image on the clipboard", {
        description: "Copy an image first, then try again.",
      });
      return;
    }
    if (hasBackdrop) {
      await placeImageFilesAsCanvasSymbols(files, {
        centerStageX: stageX,
        centerStageY: stageY,
      });
    } else {
      await placeImageFileAsBackdrop(files[0]);
    }
  };

  const cmd = isMac() ? "⌘" : "Ctrl";

  return (
    <DropdownMenu
      open
      onOpenChange={(o) => {
        if (!o) closeStageContextMenu();
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
        className="eng-stage-context-menu min-w-56"
      >
        <DropdownMenuItem onClick={onPaste}>
          {hasBackdrop ? "Paste as symbol" : "Paste as background"}
          <DropdownMenuShortcut>{cmd} V</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
