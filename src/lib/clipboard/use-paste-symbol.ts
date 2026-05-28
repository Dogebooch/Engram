"use client";

import { useEffect } from "react";
import { isTypingTarget } from "@/lib/keybindings";
import {
  imageFilesFromClipboardEvent,
  pasteImageFilesIntoCanvas,
} from "./paste-image";

export function usePasteSymbol(): void {
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const files = imageFilesFromClipboardEvent(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      await pasteImageFilesIntoCanvas(files);
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
}
