"use client";

import * as React from "react";
import { get as idbGet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { useIndexStore } from "@/lib/store/index-store";
import { loadSymbols } from "@/lib/symbols";
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

export function Hydrated({ fallback, children }: HydratedProps) {
  const persistHydrated = React.useSyncExternalStore(
    subscribePersistHydration,
    getPersistHydrated,
    getPersistHydratedSSR,
  );

  const [picmonicLoaded, setPicmonicLoaded] = React.useState(false);
  const loadStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (!persistHydrated || loadStartedRef.current) return;
    loadStartedRef.current = true;

    let cancelled = false;
    void useIndexStore.getState().loadIndex();
    // Warm the symbol library cache as early as possible. SymbolNode
    // reactively re-renders via useSymbolsReady once this resolves; no
    // need to gate first paint on it.
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
          useStore.getState().setCurrentPicmonic(null);
        }
      } catch (err) {
        console.error("[engram] failed to load picmonic", err);
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
