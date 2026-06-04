"use client";

import * as React from "react";
import { set as idbSet } from "idb-keyval";
import { toast } from "sonner";
import { picmonicKey } from "@/lib/constants";
import { BundleImportError, importBundle } from "@/lib/export/import";
import { useStore } from "@/lib/store";
import { useIndexStore, entryFromPicmonic } from "@/lib/store/index-store";
import type { Picmonic } from "@/lib/types/picmonic";
import type { MedicineVideo, SourceVideoProvenance } from "@/lib/types/source-video";
import {
  deriveBundleSourceVideo,
  findExistingImportedSource,
} from "./source-video-match";

export type BundleImportResult =
  | { status: "imported"; fileName: string; id: string; name: string; sourceVideo: SourceVideoProvenance | null }
  | { status: "skipped"; fileName: string; name: string; reason: string; existingId?: string }
  | { status: "failed"; fileName: string; reason: string };

export interface BundleImportControl {
  /** Render this hidden `<input>` once at the call site. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Bind to `<input type="file" onChange>`. */
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  /** Trigger the OS file picker. */
  pick: () => void;
  /** True while a file is being parsed/loaded. */
  busy: boolean;
  progress: { done: number; total: number } | null;
  results: BundleImportResult[] | null;
  clearResults: () => void;
}

/**
 * Shared `.zip` bundle-import flow. Same behavior as the home `ImportButton`,
 * extracted so the editor's File ▸ Import can share the path. Caller renders
 * `<input type="file" ref={inputRef} onChange={onFile} ... />` once, then
 * calls `pick()` from a button or menu item.
 */
export function useBundleImport(opts: {
  onAfterImport?: (id: string) => void;
  folderId?: string | null;
  medicineVideos?: readonly MedicineVideo[];
  openAfterImport?: boolean;
} = {}): BundleImportControl {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = React.useState<BundleImportResult[] | null>(null);
  const hydratePicmonic = useStore((s) => s.hydratePicmonic);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const upsertIndexEntry = useIndexStore((s) => s.upsertIndexEntry);
  const index = useIndexStore((s) => s.index);

  const onAfterImport = opts.onAfterImport;
  const folderId = opts.folderId ?? null;
  const medicineVideos = React.useMemo(
    () => opts.medicineVideos ?? [],
    [opts.medicineVideos],
  );
  const openAfterImport = opts.openAfterImport ?? false;

  const pick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      setBusy(true);
      setProgress({ done: 0, total: files.length });
      setResults(null);
      const batchResults: BundleImportResult[] = [];
      try {
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const result = await importBundleFile({
            file,
            folderId,
            medicineVideos,
            index: useIndexStore.getState().index ?? index ?? [],
            hydratePicmonic,
            upsertIndexEntry,
            onAfterImport,
          });
          batchResults.push(result);
          setProgress({ done: i + 1, total: files.length });
        }
        setResults(batchResults);
        const imported = batchResults.filter((r) => r.status === "imported");
        const skipped = batchResults.filter((r) => r.status === "skipped");
        const failed = batchResults.filter((r) => r.status === "failed");
        for (const result of imported) {
          if (result.sourceVideo?.confidence !== "matched") continue;
          toast(`Imported "${result.sourceVideo.title}" · removed from pending`, {
            duration: 2200,
          });
        }
        if (imported.length > 0 && openAfterImport) {
          const last = imported[imported.length - 1];
          setCurrentPicmonic(last.id);
        }
        toast(summaryToast(imported.length, skipped.length, failed.length), {
          duration: failed.length > 0 ? 5000 : 2200,
        });
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [
      folderId,
      hydratePicmonic,
      index,
      medicineVideos,
      onAfterImport,
      openAfterImport,
      setCurrentPicmonic,
      upsertIndexEntry,
    ],
  );

  return {
    inputRef,
    onFile,
    pick,
    busy,
    progress,
    results,
    clearResults: () => setResults(null),
  };
}

export async function importBundleFilesSequentially(opts: {
  files: readonly File[];
  folderId: string | null;
  medicineVideos: readonly MedicineVideo[];
  index: readonly ReturnType<typeof entryFromPicmonic>[];
  hydratePicmonic: (picmonic: Picmonic) => void;
  upsertIndexEntry: (entry: ReturnType<typeof entryFromPicmonic>) => void;
  onAfterImport?: (id: string) => void;
}): Promise<BundleImportResult[]> {
  const results: BundleImportResult[] = [];
  let currentIndex = opts.index.slice();
  for (const file of opts.files) {
    const result = await importBundleFile({
      ...opts,
      file,
      index: currentIndex,
      upsertIndexEntry: (entry) => {
        currentIndex = [entry, ...currentIndex.filter((e) => e.id !== entry.id)];
        opts.upsertIndexEntry(entry);
      },
    });
    results.push(result);
  }
  return results;
}

async function importBundleFile(opts: {
  file: File;
  folderId: string | null;
  medicineVideos: readonly MedicineVideo[];
  index: readonly ReturnType<typeof entryFromPicmonic>[];
  hydratePicmonic: (picmonic: Picmonic) => void;
  upsertIndexEntry: (entry: ReturnType<typeof entryFromPicmonic>) => void;
  onAfterImport?: (id: string) => void;
}): Promise<BundleImportResult> {
  const { file } = opts;
  if (!isZipFile(file)) {
    return {
      status: "failed",
      fileName: file.name,
      reason: "Not a .zip file",
    };
  }
  try {
    const imported = await importBundle(await file.arrayBuffer());
    const sourceVideo = deriveBundleSourceVideo(
      imported.meta.sourceVideo,
      imported.meta.name,
      opts.medicineVideos,
    );
    const existing = findExistingImportedSource(opts.index, sourceVideo);
    if (existing) {
      return {
        status: "skipped",
        fileName: file.name,
        name: imported.meta.name,
        reason: `Already imported as "${existing.name}"`,
        existingId: existing.id,
      };
    }
    const picmonic: Picmonic = {
      ...imported,
      meta: {
        ...imported.meta,
        folderId: opts.folderId,
        sourceVideo,
      },
    };
    opts.hydratePicmonic(picmonic);
    await idbSet(picmonicKey(picmonic.id), picmonic);
    opts.upsertIndexEntry(entryFromPicmonic(picmonic, null));
    opts.onAfterImport?.(picmonic.id);
    return {
      status: "imported",
      fileName: file.name,
      id: picmonic.id,
      name: picmonic.meta.name,
      sourceVideo,
    };
  } catch (err) {
    console.error("[engram] import failed", err);
    return {
      status: "failed",
      fileName: file.name,
      reason:
        err instanceof BundleImportError
          ? err.message
          : err instanceof Error && err.message
            ? err.message
            : "Import failed",
    };
  }
}

function isZipFile(file: File): boolean {
  return (
    /\.zip$/i.test(file.name) ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

function summaryToast(imported: number, skipped: number, failed: number): string {
  const parts: string[] = [];
  parts.push(`Imported ${imported} package${imported === 1 ? "" : "s"}`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}
