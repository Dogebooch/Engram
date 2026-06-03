"use client";

import * as React from "react";
import type Konva from "konva";
import { toast } from "sonner";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
  USER_ASSET_ALLOWED_MIMES,
  USER_BACKDROP_MAX_BYTES,
} from "@/lib/constants";
import { clampToStage } from "@/lib/canvas/clamp-stage";
import { uploadUserAssets } from "@/lib/user-assets";
import { useStore } from "@/lib/store";
import { placeUploadedAssetOnCanvas } from "../panels/symbol-library/auto-place-upload";
import { reportUploadResult } from "../panels/symbol-library/upload-result-toasts";

interface Args {
  stageRef: React.RefObject<Konva.Stage | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

/**
 * OS-file image drops on the canvas, disambiguated by whether a background is
 * already set:
 *   - no backdrop  → the (single) dropped image becomes the background.
 *   - backdrop set → dropped images become symbols at the drop point, filed
 *                    under the active Fact, and (for a single image) the
 *                    describe popover opens on the new symbol.
 *
 * Non-conflicting with `useCanvasDrop`, which only matches the symbol drag MIME.
 */
export function useCanvasFileDrop({ stageRef, containerRef }: Args): {
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

      const state = useStore.getState();
      const cid = state.currentPicmonicId;
      const backdrop = cid ? state.picmonics[cid]?.canvas.backdrop : null;
      const hasBackdrop = !!backdrop?.uploadedBlobId;

      if (!hasBackdrop) {
        // First image becomes the background. Multi-file drops are ambiguous.
        if (files.length > 1) return;
        const file = files[0];
        if (!USER_ASSET_ALLOWED_MIMES.includes(file.type)) {
          toast.error("Unsupported format", {
            description: "Use PNG, JPG, WebP, SVG, or GIF.",
          });
          return;
        }
        if (file.size > USER_BACKDROP_MAX_BYTES) {
          toast.error("File is too large", {
            description: `Backdrops must be under ${(USER_BACKDROP_MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`,
          });
          return;
        }
        void state.setBackdropFromUpload(file).then((result) => {
          if (result.kind === "ok") {
            toast.success("Background set");
          } else if (result.kind === "rejected") {
            toast.error("Couldn't set background", {
              description: rejectMessage(result.reason),
            });
          }
        });
        return;
      }

      // Backdrop present: dropped images become placed symbols at the drop point.
      const valid = files.filter((f) =>
        USER_ASSET_ALLOWED_MIMES.includes(f.type),
      );
      if (valid.length === 0) {
        toast.error("Unsupported format", {
          description: "Use PNG, JPG, WebP, SVG, or GIF.",
        });
        return;
      }
      const drop = dropPoint(stageRef.current, e.clientX, e.clientY);
      const targetFactId = state.addSymbolTargetFactId;
      void uploadUserAssets(valid).then((result) => {
        reportUploadResult(result);
        const assets = [...result.added, ...result.duplicates];
        if (assets.length === 0) return;
        let firstLayerId: string | null = null;
        assets.forEach((asset, i) => {
          const p = clampToStage(drop.x + i * 16, drop.y + i * 16);
          const layerId = placeUploadedAssetOnCanvas(asset.id, {
            x: p.x,
            y: p.y,
            targetFactId,
          });
          if (i === 0) firstLayerId = layerId;
        });
        if (assets.length === 1 && firstLayerId) {
          useStore.getState().openDescribePopover(firstLayerId);
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
  }, [containerRef, stageRef]);

  return { fileHover };
}

function dropPoint(
  stage: Konva.Stage | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const half = SYMBOL_DEFAULT_SIZE / 2;
  if (!stage) return clampToStage(CENTER_X, CENTER_Y);
  const rect = stage.container().getBoundingClientRect();
  const scale = stage.scaleX() || 1;
  return clampToStage(
    (clientX - rect.left) / scale - half,
    (clientY - rect.top) / scale - half,
  );
}

function rejectMessage(reason: string): string {
  switch (reason) {
    case "mime":
      return "Unsupported format. Use PNG, JPG, WebP, SVG, or GIF.";
    case "size":
      return `File exceeds ${(USER_BACKDROP_MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`;
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
