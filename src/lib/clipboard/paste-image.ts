"use client";

import { toast } from "sonner";
import { reportUploadResult } from "@/components/editor/panels/symbol-library/upload-result-toasts";
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import { clampToStage } from "@/lib/canvas/clamp-stage";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { uploadUserAssets, userAssetSymbolId } from "@/lib/user-assets";

const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

export interface PlaceImageOptions {
  /**
   * Stage-local coordinate where the symbol's centre should land. If omitted,
   * the symbol drops at canvas centre (the Ctrl+V behaviour).
   */
  centerStageX?: number;
  centerStageY?: number;
}

/**
 * Run image File(s) through the user-asset upload pipeline and place each
 * resulting symbol on the canvas. Reused by Ctrl+V paste and the right-click
 * "Paste image" action. Surfaces the same upload toasts.
 */
export async function placeImageFilesAsCanvasSymbols(
  files: readonly File[],
  opts: PlaceImageOptions = {},
): Promise<void> {
  if (files.length === 0) return;
  if (!useStore.getState().currentPicmonicId) {
    toast.error("Create a Picmonic first", {
      description: "⌘/Ctrl+N or the + button up top.",
    });
    return;
  }

  const result = await uploadUserAssets(files);
  reportUploadResult(result);

  const half = SYMBOL_DEFAULT_SIZE / 2;
  const { x, y } =
    opts.centerStageX !== undefined && opts.centerStageY !== undefined
      ? clampToStage(opts.centerStageX - half, opts.centerStageY - half)
      : { x: CENTER_X, y: CENTER_Y };

  for (const asset of result.added) {
    addSymbolWithNoteSync({ ref: userAssetSymbolId(asset.id), x, y });
  }
  // Re-place duplicates too — pasting the same image twice should still drop
  // a copy on the canvas (matches drag-drop semantics).
  for (const asset of result.duplicates) {
    addSymbolWithNoteSync({ ref: userAssetSymbolId(asset.id), x, y });
  }
}

/** Pull image File(s) out of a `paste` event's clipboard payload. */
export function imageFilesFromClipboardEvent(
  data: DataTransfer | null,
): File[] {
  if (!data) return [];
  const out: File[] = [];
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

/**
 * Pull image File(s) from the system clipboard via the async Clipboard API
 * (used when triggering paste from a UI control rather than a paste event).
 * Returns an empty array if the clipboard has no image, the API is
 * unavailable, or the user denies permission.
 */
export async function imageFilesFromClipboardApi(): Promise<File[]> {
  if (!navigator.clipboard?.read) return [];
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    // Permission denied / no user gesture / unsupported.
    return [];
  }
  const out: File[] = [];
  for (const item of items) {
    for (const type of item.types) {
      if (!type.startsWith("image/")) continue;
      try {
        const blob = await item.getType(type);
        const ext = extForMime(type);
        out.push(new File([blob], `clipboard.${ext}`, { type }));
      } catch {
        // Skip unreadable items.
      }
      break;
    }
  }
  return out;
}

function extForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
