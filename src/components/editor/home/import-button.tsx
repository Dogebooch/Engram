"use client";

import { ArchiveRestoreIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useBundleImport,
  type BundleImportResult,
} from "@/lib/import/use-bundle-import";
import type { MedicineVideo } from "@/lib/types/source-video";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportButtonProps {
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
  className?: string;
  onAfterImport?: (id: string) => void;
  folderId?: string | null;
  medicineVideos?: readonly MedicineVideo[];
  openAfterImport?: boolean;
}

export function ImportButton({
  variant = "outline",
  size = "sm",
  className,
  onAfterImport,
  folderId,
  medicineVideos,
  openAfterImport,
}: ImportButtonProps) {
  const { inputRef, onFile, pick, busy, progress, results, clearResults } =
    useBundleImport({
      onAfterImport,
      folderId,
      medicineVideos,
      openAfterImport,
    });

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
        <span className="hidden md:inline">
          {progress ? `${progress.done}/${progress.total}` : "Import"}
        </span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".zip,application/zip"
        className="hidden"
        onChange={onFile}
      />
      <ImportResultsDialog results={results} onClose={clearResults} />
    </>
  );
}

function ImportResultsDialog({
  results,
  onClose,
}: {
  results: BundleImportResult[] | null;
  onClose: () => void;
}) {
  const notable =
    results?.filter((r) => r.status === "failed" || r.status === "skipped") ?? [];
  if (!results || notable.length === 0) return null;
  return (
    <Dialog open={Boolean(results)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Import results
          </DialogTitle>
          <DialogDescription>
            Successful imports were kept. Review skipped or failed packages below.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {notable.map((r) => (
            <div
              key={`${r.status}:${r.fileName}`}
              className="rounded-md border border-border/60 bg-card/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">
                  {r.fileName}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.status === "failed" ? r.reason : r.reason}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
