"use client";

import * as React from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { SaveStatus } from "@/lib/types/picmonic";
import { checkStorageQuota, thresholdAt, type QuotaThreshold } from "./quota";
import { exportBundle } from "@/lib/export";
import { getCurrentStage } from "@/components/editor/canvas/canvas-stage-ref";

const POST_SAVE_QUOTA_DELAY_MS = 2_000;

/**
 * Single hook mounted once in editor-shell. Two responsibilities:
 *   1. Storage-quota warnings on threshold crossings (80% / 95%) — fires on
 *      saving → saved transitions plus once on app mount.
 *   2. Save-error recovery toast on saveStatus → "error" with an "Export
 *      bundle" action so the user can rescue unsaved work.
 *
 * Threshold-crossing logic only fires once per crossing; persisted
 * `ui.storageQuota.lastWarned` survives reload to avoid re-firing.
 */
export function useSaveFlowMonitor(): void {
  React.useEffect(() => {
    let lastStatus: SaveStatus = useStore.getState().saveStatus;
    let postSaveQuotaTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const evaluateQuota = async (suppressInitialWarning: boolean) => {
      const result = await checkStorageQuota();
      if (!mounted || !result) return;
      const { percent } = result;
      const crossed = thresholdAt(percent);
      const state = useStore.getState();
      const prev = state.ui.storageQuota.lastWarned;

      // First-mount: avoid stale-warning spam by recording the *current*
      // threshold without firing a toast.
      if (suppressInitialWarning) {
        state.setStorageQuota({ percent, lastWarned: crossed });
        return;
      }

      if (crossed === null) {
        // Below 80% — clear so a future crossing fires fresh.
        if (prev !== null || state.ui.storageQuota.percent !== percent) {
          state.setStorageQuota({ percent, lastWarned: null });
        }
        return;
      }

      // Fire only on threshold *upgrades*: null→80, null→95, 80→95.
      if (prev !== "95" && crossed === "95") {
        fireQuotaToast95();
      } else if (prev === null && crossed === "80") {
        fireQuotaToast80();
      }
      state.setStorageQuota({ percent, lastWarned: highestThreshold(prev, crossed) });
    };

    const onSaveError = () => {
      toast.error("Save failed", {
        description:
          "Your last changes may not be on disk. Try again, or export a backup now.",
        duration: 12_000,
        action: {
          label: "Export bundle",
          onClick: () => {
            const s = useStore.getState();
            const id = s.currentPicmonicId;
            const p = id ? s.picmonics[id] : undefined;
            if (!p) return;
            void exportBundle(getCurrentStage(), p).catch((err) => {
              console.error("[engram] backup export failed", err);
              toast.error("Bundle export failed");
            });
          },
        },
      });
    };

    // Initial mount probe (no toast).
    void evaluateQuota(true);

    const unsubscribe = useStore.subscribe((state) => {
      const status = state.saveStatus;
      if (status === lastStatus) return;
      const prev = lastStatus;
      lastStatus = status;

      if (status === "saved" && prev === "saving") {
        // Defer past the thumbnail capture (which fires on this same transition)
        // so the IDB write has actually settled.
        if (postSaveQuotaTimer) clearTimeout(postSaveQuotaTimer);
        postSaveQuotaTimer = setTimeout(() => {
          void evaluateQuota(false);
        }, POST_SAVE_QUOTA_DELAY_MS);
      } else if (status === "error") {
        onSaveError();
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
      if (postSaveQuotaTimer) clearTimeout(postSaveQuotaTimer);
    };
  }, []);
}

function highestThreshold(
  a: QuotaThreshold | null,
  b: QuotaThreshold | null,
): QuotaThreshold | null {
  if (a === "95" || b === "95") return "95";
  if (a === "80" || b === "80") return "80";
  return null;
}

function fireQuotaToast80() {
  toast.warning("Storage 80% full", {
    description: "Consider exporting and deleting old Picmonics.",
    duration: 6_000,
  });
}

function fireQuotaToast95() {
  toast.error("Storage 95% full — saves may fail", {
    description: "Free space by deleting an old Picmonic.",
    duration: 12_000,
    action: {
      label: "Open Home",
      onClick: () => {
        useStore.getState().setCurrentPicmonic(null);
      },
    },
  });
}
