"use client";

import { useEffect, useState } from "react";

type Resolved = { kind: "resolved"; image: HTMLImageElement };
type Pending = { kind: "pending"; promise: Promise<HTMLImageElement> };
type Failed = { kind: "failed"; error: Error };
type Slot = Resolved | Pending | Failed;

const slots = new Map<string, Slot>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export const imageCache = {
  get(url: string): Promise<HTMLImageElement> {
    const slot = slots.get(url);
    if (slot?.kind === "resolved") return Promise.resolve(slot.image);
    if (slot?.kind === "pending") return slot.promise;
    if (slot?.kind === "failed") return Promise.reject(slot.error);

    const promise = loadImage(url).then(
      (image) => {
        slots.set(url, { kind: "resolved", image });
        return image;
      },
      (error: Error) => {
        slots.set(url, { kind: "failed", error });
        throw error;
      },
    );
    slots.set(url, { kind: "pending", promise });
    return promise;
  },
  peek(url: string): HTMLImageElement | null {
    const slot = slots.get(url);
    return slot?.kind === "resolved" ? slot.image : null;
  },
};

export type UseImageState =
  | { status: "loading" }
  | { status: "ready"; image: HTMLImageElement }
  | { status: "error"; error: Error };

export function useImage(url: string | null | undefined): UseImageState {
  const [state, setState] = useState<UseImageState>(() => {
    if (!url) return { status: "error", error: new Error("no url") };
    const cached = imageCache.peek(url);
    if (cached) return { status: "ready", image: cached };
    return { status: "loading" };
  });

  useEffect(() => {
    if (!url) {
      setState({ status: "error", error: new Error("no url") });
      return;
    }
    const cached = imageCache.peek(url);
    if (cached) {
      setState({ status: "ready", image: cached });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    imageCache.get(url).then(
      (image) => {
        if (!cancelled) setState({ status: "ready", image });
      },
      (error: Error) => {
        if (!cancelled) setState({ status: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
