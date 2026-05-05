"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  USER_ASSET_ALLOWED_MIMES,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { useStore } from "@/lib/store";

interface Args {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Listens for OS-file image drops on the canvas container and routes them
 * to `setBackdropFromUpload`. Non-conflicting with `useCanvasDrop`, which
 * only matches the symbol drag MIME. We only react when the drag carries
 * exactly one image file.
 */
export function useBackdropFileDrop({ containerRef }: Args): {
  fileHover: boolean;
} {
  const [fileHover, setFileHover] = React.useState(false);
  const depthRef = React.useRef(0);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dragHasImageFiles = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (const t of types) {
        if (t === "Files") return true;
      }
      return false;
    };

    const onDragEnter = (e: DragEvent) => {
      if (!dragHasImageFiles(e)) return;
      e.preventDefault();
      depthRef.current += 1;
      setFileHover(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!dragHasImageFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (e: DragEvent) => {
      if (!dragHasImageFiles(e)) return;
      depthRef.current -= 1;
      if (depthRef.current <= 0) {
        depthRef.current = 0;
        setFileHover(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      if (!dragHasImageFiles(e)) return;
      e.preventDefault();
      depthRef.current = 0;
      setFileHover(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      // Only single-file drops set the backdrop. Multi-file drops are
      // ambiguous (likely intended for the symbol uploader) — ignore them.
      if (files.length > 1) return;
      const file = files[0];
      if (!USER_ASSET_ALLOWED_MIMES.includes(file.type)) {
        toast.error("Unsupported format", {
          description: "Use PNG, JPG, WebP, SVG, or GIF.",
        });
        return;
      }
      if (file.size > USER_ASSET_MAX_BYTES) {
        toast.error("File is too large", {
          description: `Backdrops must be under ${(USER_ASSET_MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`,
        });
        return;
      }
      void useStore
        .getState()
        .setBackdropFromUpload(file)
        .then((result) => {
          if (result.kind === "ok") {
            toast.success("Background set");
          } else if (result.kind === "rejected") {
            toast.error("Couldn't set background", {
              description: rejectMessage(result.reason),
            });
          }
        });
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [containerRef]);

  return { fileHover };
}

function rejectMessage(reason: string): string {
  switch (reason) {
    case "mime":
      return "Unsupported format. Use PNG, JPG, WebP, SVG, or GIF.";
    case "size":
      return `File exceeds ${(USER_ASSET_MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`;
    case "quota":
      return "Storage is nearly full. Delete unused Picmonics or uploads first.";
    case "empty":
      return "File is empty.";
    case "read-error":
      return "Could not read the file.";
    default:
      return reason;
  }
}
