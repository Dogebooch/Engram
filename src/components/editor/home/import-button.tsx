"use client";

import { ArchiveRestoreIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBundleImport } from "@/lib/import/use-bundle-import";

interface ImportButtonProps {
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
  className?: string;
  onAfterImport?: (id: string) => void;
}

export function ImportButton({
  variant = "outline",
  size = "sm",
  className,
  onAfterImport,
}: ImportButtonProps) {
  const { inputRef, onFile, pick, busy } = useBundleImport({ onAfterImport });

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={pick}
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
