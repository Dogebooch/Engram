"use client";

import * as React from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import {
  exportAnkiCsv,
  exportBundle,
  exportMarkdown,
  exportPng,
} from "@/lib/export";
import { useCurrentStage } from "./canvas/canvas-stage-ref";

function isQuotaExceeded(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "QuotaExceededError" || /quota/i.test(err.message);
}

function messageForExportError(err: unknown, label: string): string {
  if (isQuotaExceeded(err)) {
    return `${label} export failed — storage full. Free space and retry.`;
  }
  if (err instanceof Error && err.message) {
    return `${label} export failed: ${err.message}`;
  }
  return `${label} export failed`;
}

export interface ExportActions {
  onPng: () => void;
  onMarkdown: () => void;
  onAnki: () => void;
  onBundle: () => void;
  /** True while any export is in flight. Disable triggers. */
  busy: boolean;
  /** True when a picmonic is open AND the Konva stage is mounted. */
  hasStage: boolean;
  /** True when a picmonic is open (independent of stage). */
  hasPicmonic: boolean;
}

/**
 * Shared editor-side export action set. Drives both the standalone topbar
 * Export dropdown and the File ▸ Export submenu from one place so they
 * cannot drift in behavior or copy.
 */
export function useExportActions(): ExportActions {
  const currentId = useCurrentPicmonicId();
  const stage = useCurrentStage();
  const [busy, setBusy] = React.useState(false);

  const wrap = React.useCallback(
    async (fn: () => Promise<void> | void, label: string) => {
      setBusy(true);
      try {
        await fn();
        toast(`Exported ${label}`, { duration: 1400 });
      } catch (err) {
        console.error(err);
        toast.error(messageForExportError(err, label));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const getPicmonic = React.useCallback(() => {
    const s = useStore.getState();
    return currentId ? s.picmonics[currentId] : undefined;
  }, [currentId]);

  const onPng = React.useCallback(() => {
    const p = getPicmonic();
    if (!p || !stage) {
      toast.error("Canvas not ready");
      return;
    }
    void wrap(() => exportPng(stage, p), "PNG");
  }, [getPicmonic, stage, wrap]);

  const onMarkdown = React.useCallback(() => {
    const p = getPicmonic();
    if (!p) return;
    void wrap(() => exportMarkdown(p), "Markdown");
  }, [getPicmonic, wrap]);

  const onAnki = React.useCallback(() => {
    const p = getPicmonic();
    if (!p) return;
    void wrap(() => exportAnkiCsv(p), "Anki CSV");
  }, [getPicmonic, wrap]);

  const onBundle = React.useCallback(() => {
    const p = getPicmonic();
    if (!p) return;
    void wrap(() => exportBundle(stage, p), "Bundle");
  }, [getPicmonic, stage, wrap]);

  return {
    onPng,
    onMarkdown,
    onAnki,
    onBundle,
    busy,
    hasStage: !!stage,
    hasPicmonic: !!currentId,
  };
}
