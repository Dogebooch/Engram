"use client";

import * as React from "react";
import { toast } from "sonner";
import { USER_ASSET_ACCEPT } from "@/lib/constants";
import { useStore } from "@/lib/store";

export interface UploadPicmonicControl {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  pick: () => void;
  /** Drop a File directly (used by drag-drop overlay). */
  fromFile: (file: File) => Promise<void>;
  busy: boolean;
  acceptAttr: string;
}

/**
 * One-step "upload pre-made picture mnemonic" flow:
 *  1. Create a picmonic named after the file (filename stem).
 *  2. Set the dropped/selected image as the backdrop.
 *  3. The editor mounts because `currentPicmonicId` is now set.
 *
 * Replaces the "create empty picmonic → manually find Add backdrop card →
 * drop image" path with a single gesture. Modelled on Anki's Add Card and
 * Notion's `/image` dialog.
 */
export function useUploadPicmonic(opts: {
  onAfterUpload?: (id: string) => void;
} = {}): UploadPicmonicControl {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const createPicmonic = useStore((s) => s.createPicmonic);
  const renamePicmonic = useStore((s) => s.renamePicmonic);
  const deletePicmonic = useStore((s) => s.deletePicmonic);
  const setBackdropFromUpload = useStore((s) => s.setBackdropFromUpload);

  const onAfterUpload = opts.onAfterUpload;

  const pick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const fromFile = React.useCallback(
    async (file: File) => {
      if (!file) return;
      setBusy(true);
      const stem = stemFromFilename(file.name);
      const newId = createPicmonic(stem || "Untitled Picmonic");
      try {
        const result = await setBackdropFromUpload(file);
        if (result.kind !== "ok") {
          toast.error(rejectMessage(result.reason));
          // Roll back: delete the just-created (empty) picmonic so the
          // library doesn't fill up with empty cards after a bad upload.
          await deletePicmonic(newId);
          return;
        }
        if (stem) renamePicmonic(newId, stem);
        toast.success(`Created "${stem || "Untitled Picmonic"}"`, {
          description: "Now outline symbols and tag them.",
          duration: 2200,
        });
        onAfterUpload?.(newId);
      } catch (err) {
        console.error("[engram] upload picmonic failed", err);
        toast.error("Upload failed");
        await deletePicmonic(newId);
      } finally {
        setBusy(false);
      }
    },
    [createPicmonic, deletePicmonic, onAfterUpload, renamePicmonic, setBackdropFromUpload],
  );

  const onFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await fromFile(file);
    },
    [fromFile],
  );

  return { inputRef, onFile, pick, fromFile, busy, acceptAttr: USER_ASSET_ACCEPT };
}

function stemFromFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.replace(/[_-]+/g, " ").trim();
}

function rejectMessage(reason: string): string {
  switch (reason) {
    case "mime":
      return "That file type isn't supported.";
    case "size":
      return "Image is too large (30MB max).";
    case "quota":
      return "Local storage is nearly full.";
    case "empty":
      return "File is empty.";
    case "read-error":
      return "Couldn't read the file.";
    default:
      return "Upload rejected.";
  }
}
