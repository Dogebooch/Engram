"use client";

import * as React from "react";
import { toast } from "sonner";
import { BundleImportError, importBundle } from "@/lib/export/import";
import { useStore } from "@/lib/store";
import { useIndexStore, entryFromPicmonic } from "@/lib/store/index-store";

export interface BundleImportControl {
  /** Render this hidden `<input>` once at the call site. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Bind to `<input type="file" onChange>`. */
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  /** Trigger the OS file picker. */
  pick: () => void;
  /** True while a file is being parsed/loaded. */
  busy: boolean;
}

/**
 * Shared `.zip` bundle-import flow. Same behavior as the home `ImportButton`,
 * extracted so the editor's File ▸ Import can share the path. Caller renders
 * `<input type="file" ref={inputRef} onChange={onFile} ... />` once, then
 * calls `pick()` from a button or menu item.
 */
export function useBundleImport(opts: {
  onAfterImport?: (id: string) => void;
} = {}): BundleImportControl {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const hydratePicmonic = useStore((s) => s.hydratePicmonic);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const upsertIndexEntry = useIndexStore((s) => s.upsertIndexEntry);

  const onAfterImport = opts.onAfterImport;

  const pick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      try {
        const picmonic = await importBundle(file);
        hydratePicmonic(picmonic);
        upsertIndexEntry(entryFromPicmonic(picmonic, null));
        setCurrentPicmonic(picmonic.id);
        toast(`Imported "${picmonic.meta.name}"`, { duration: 1800 });
        onAfterImport?.(picmonic.id);
      } catch (err) {
        console.error("[engram] import failed", err);
        const msg =
          err instanceof BundleImportError
            ? err.message
            : err instanceof Error && err.message
              ? `Import failed: ${err.message}`
              : "Import failed";
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [hydratePicmonic, onAfterImport, setCurrentPicmonic, upsertIndexEntry],
  );

  return { inputRef, onFile, pick, busy };
}
