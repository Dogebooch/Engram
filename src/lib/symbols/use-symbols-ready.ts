"use client";

import * as React from "react";
import { getCachedSymbols, loadSymbols } from "./load";

/**
 * Triggers `loadSymbols()` if the cache is empty, and re-renders once it
 * resolves. Returns true when the library cache is populated and lookups
 * via `getSymbolById` will succeed.
 */
export function useSymbolsReady(): boolean {
  const [ready, setReady] = React.useState<boolean>(
    () => getCachedSymbols() !== null,
  );

  React.useEffect(() => {
    if (ready) return;
    let cancelled = false;
    loadSymbols()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        // Library failed to load — leave `ready` false so consumers fall
        // through to "missing" placeholders rather than throwing.
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}
