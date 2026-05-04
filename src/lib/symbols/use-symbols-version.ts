"use client";

import { useSyncExternalStore } from "react";
import { getSymbolsVersion, subscribeSymbols } from "./load";

/**
 * Re-renders whenever the symbol cache mutates (base load + register/unregister
 * of user symbols). Returns the current version counter; consumers typically
 * use it as a memo key rather than reading the value directly.
 */
export function useSymbolsVersion(): number {
  return useSyncExternalStore(
    subscribeSymbols,
    getSymbolsVersion,
    getSymbolsVersion,
  );
}
