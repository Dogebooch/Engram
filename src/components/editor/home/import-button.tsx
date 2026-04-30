"use client";

import * as React from "react";
import { ArchiveRestoreIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useIndexStore, entryFromPicmonic } from "@/lib/store/index-store";
import {
  BundleImportError,
  importBundle,
} from "@/lib/export/import";

interface ImportButtonProps {
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
  className?: string;
  /** Called after a successful import + load (for emptier-state CTAs that want to peel off). */
  onAfterImport?: (id: string) => void;
}

/**
 * Hidden file input + button. Imports a Phase 6 .zip bundle, registers as a
 * fresh Picmonic, and loads it into the editor.
 */
export function ImportButton({
  variant = "outline",
  size = "sm",
  className,
  onAfterImport,
}: ImportButtonProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const hydratePicmonic = useStore((s) => s.hydratePicmonic);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const upsertIndexEntry = useIndexStore((s) => s.upsertIndexEntry);

  const onPick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
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
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={onPick}
        disabled={busy}
        className={className}
        aria-label="Import bundle (.zip)"
      >
        {busy ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <ArchiveRestoreIcon />
        )}
        <span className="hidden md:inline">Import</span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={onFile}
      />
    </>
  );
}
