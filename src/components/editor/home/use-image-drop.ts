"use client";

import * as React from "react";
import { USER_ASSET_ALLOWED_MIMES } from "@/lib/constants";

export interface ImageDropControl {
  /** Container ref — attach to the drop zone element. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** True while a file is being dragged over the page. */
  hovering: boolean;
}

/**
 * Listen for image drops anywhere inside the bound container element.
 * Calls `onDrop(file)` with the first image found in `dataTransfer.files`.
 * Sets `hovering` true while a file is being dragged over so callers can
 * render a full-zone accent overlay.
 *
 * Uses a small dragenter counter to avoid the dragover flicker that
 * happens when nested children fire their own dragenter/dragleave.
 */
export function useImageDrop(onDrop: (file: File) => void): ImageDropControl {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [hovering, setHovering] = React.useState(false);
  const onDropRef = React.useRef(onDrop);
  React.useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let depth = 0;

    const isImageTransfer = (dt: DataTransfer | null): boolean => {
      if (!dt) return false;
      for (const item of dt.items) {
        if (item.kind === "file" && USER_ASSET_ALLOWED_MIMES.includes(item.type)) {
          return true;
        }
      }
      return false;
    };

    const onDragEnter = (e: DragEvent) => {
      if (!isImageTransfer(e.dataTransfer)) return;
      e.preventDefault();
      depth += 1;
      if (depth === 1) setHovering(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!isImageTransfer(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isImageTransfer(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setHovering(false);
    };
    const onDropEvent = (e: DragEvent) => {
      depth = 0;
      setHovering(false);
      if (!isImageTransfer(e.dataTransfer)) return;
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      for (const f of files) {
        if (USER_ASSET_ALLOWED_MIMES.includes(f.type)) {
          onDropRef.current(f);
          return;
        }
      }
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDropEvent);
    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDropEvent);
    };
  }, []);

  return { containerRef, hovering };
}
