"use client";

import * as React from "react";

function readVar(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value.length > 0 ? value : null;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => obs.disconnect();
}

/**
 * Reads a CSS custom property from <html> and re-reads when the theme class
 * changes. Use for Konva fills / stroke values that need to track light↔dark.
 *
 * Returns null on SSR (caller should fall back to a sensible default).
 */
export function useThemedCssVar(name: string, fallback?: string): string | null {
  const getSnapshot = React.useCallback(() => readVar(name), [name]);
  const getServerSnapshot = React.useCallback(() => null, []);
  const value = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return value ?? fallback ?? null;
}
