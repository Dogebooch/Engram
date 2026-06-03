"use client";

import * as React from "react";
import { toast } from "sonner";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { useIndexStore, entryFromPicmonic } from "@/lib/store/index-store";
import { loadSymbols } from "@/lib/symbols";
import { requestPersistentStorage } from "@/lib/storage/persist";
import { useFlushOnUnload } from "@/lib/storage/use-flush-on-unload";
import {
  clearCrashMirror,
  readCrashMirrors,
} from "@/lib/storage/crash-mirror";
import { sweepOrphanUserAssetBlobs } from "@/lib/user-assets/orphan-sweep";
import type { Picmonic } from "@/lib/types/picmonic";

interface HydratedProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

function subscribePersistHydration(cb: () => void): () => void {
  return useStore.persist.onFinishHydration(cb);
}

function getPersistHydrated(): boolean {
  return useStore.persist.hasHydrated();
}

function getPersistHydratedSSR(): boolean {
  return false;
}

async function recoverCrashMirrors(): Promise<number> {
  const mirrors = readCrashMirrors();
  if (mirrors.length === 0) return 0;
  let recovered = 0;
  for (const m of mirrors) {
    try {
      const onDisk = await idbGet<Picmonic>(picmonicKey(m.id));
      const winning = !onDisk || (m.meta.updatedAt ?? 0) > (onDisk.meta.updatedAt ?? 0)
        ? m
        : onDisk;
      if (winning === m) {
        await idbSet(picmonicKey(m.id), m);
        useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(m, null));
        recovered += 1;
      }
      clearCrashMirror(m.id);
    } catch {
      /* leave the mirror in place; another reload will retry */
    }
  }
  return recovered;
}

export function Hydrated({ fallback, children }: HydratedProps) {
  const persistHydrated = React.useSyncExternalStore(
    subscribePersistHydration,
    getPersistHydrated,
    getPersistHydratedSSR,
  );

  const [picmonicLoaded, setPicmonicLoaded] = React.useState(false);
  const loadStartedRef = React.useRef(false);

  useFlushOnUnload();

  React.useEffect(() => {
    if (!persistHydrated || loadStartedRef.current) return;
    loadStartedRef.current = true;

    let cancelled = false;
    void (async () => {
      const recovered = await recoverCrashMirrors();
      if (recovered > 0 && !cancelled) {
        toast.success(
          recovered === 1
            ? "Recovered 1 unsaved picmonic from your last session."
            : `Recovered ${recovered} unsaved picmonics from your last session.`,
        );
      }
      await useIndexStore.getState().loadIndex();
      // Sweep orphan user-asset blobs after the index is loaded so the
      // picmonic-id list it walks is authoritative. Errors are logged
      // inside; never rejects.
      void sweepOrphanUserAssetBlobs().catch((err) => {
        console.error("[engram] orphan asset sweep failed", err);
      });
    })();
    void requestPersistentStorage();
    void loadSymbols().catch(() => {
      /* SymbolNode handles missing-library state */
    });
    void (async () => {
      const id = useStore.getState().currentPicmonicId;
      if (!id) {
        if (!cancelled) setPicmonicLoaded(true);
        return;
      }
      try {
        const data = await idbGet<Picmonic>(picmonicKey(id));
        if (cancelled) return;
        if (data) {
          useStore.getState().hydratePicmonic(data);
        } else {
          toast.error("Couldn't reopen your last picmonic.", {
            description: "Its data is missing — likely an interrupted save.",
          });
          useStore.getState().setCurrentPicmonic(null);
        }
      } catch (err) {
        console.error("[engram] failed to load picmonic", err);
        toast.error("Couldn't reopen your last picmonic.");
        useStore.getState().setCurrentPicmonic(null);
      } finally {
        if (!cancelled) setPicmonicLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [persistHydrated]);

  if (!persistHydrated || !picmonicLoaded) return <>{fallback}</>;
  return <>{children}</>;
}
