"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { reportUploadResult } from "@/components/editor/panels/symbol-library/upload-button";
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
} from "@/lib/constants";
import { isTypingTarget } from "@/lib/keybindings";
import { useStore } from "@/lib/store";
import { uploadUserAssets, userAssetSymbolId } from "@/lib/user-assets";

const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  // `files` is the modern path. Fall back to `items` in case a browser
  // (or a Tauri webview quirk) only surfaces clipboard images that way.
  for (const f of Array.from(data.files)) {
    if (f.type.startsWith("image/")) out.push(f);
  }
  if (out.length > 0) return out;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

export function usePasteSymbol(): void {
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const files = imageFilesFromClipboard(e.clipboardData);
      if (files.length === 0) return;

      e.preventDefault();

      if (!useStore.getState().currentPicmonicId) {
        toast.error("Create a Picmonic first", {
          description: "⌘/Ctrl+N or the + button up top.",
        });
        return;
      }

      const result = await uploadUserAssets(files);
      reportUploadResult(result);

      for (const asset of result.added) {
        addSymbolWithNoteSync({
          ref: userAssetSymbolId(asset.id),
          x: CENTER_X,
          y: CENTER_Y,
        });
      }
      // Re-place duplicates too — pasting the same image twice should still
      // drop a copy on the canvas (matches drag-drop semantics for an existing
      // library symbol).
      for (const asset of result.duplicates) {
        addSymbolWithNoteSync({
          ref: userAssetSymbolId(asset.id),
          x: CENTER_X,
          y: CENTER_Y,
        });
      }
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
}
