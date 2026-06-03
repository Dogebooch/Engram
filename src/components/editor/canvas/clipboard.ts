"use client";

import type { PastedLayer } from "@/lib/store/slices/canvas-slice";

const PAYLOAD_PREFIX = "engram-symbols-v1:";

export interface ClipboardPayload {
  version: 1;
  layers: PastedLayer[];
}

export function serializeForClipboard(layers: PastedLayer[]): string {
  const payload: ClipboardPayload = { version: 1, layers };
  return PAYLOAD_PREFIX + JSON.stringify(payload);
}

export function tryParseClipboard(text: string): PastedLayer[] | null {
  if (!text.startsWith(PAYLOAD_PREFIX)) return null;
  try {
    const json = text.slice(PAYLOAD_PREFIX.length);
    const parsed = JSON.parse(json) as ClipboardPayload;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.layers)) {
      return null;
    }
    const out: PastedLayer[] = [];
    for (const l of parsed.layers) {
      if (!l || typeof l.ref !== "string") continue;
      out.push({
        ref: l.ref,
        x: typeof l.x === "number" ? l.x : 0,
        y: typeof l.y === "number" ? l.y : 0,
        width: typeof l.width === "number" ? l.width : 220,
        height: typeof l.height === "number" ? l.height : 220,
        rotation: typeof l.rotation === "number" ? l.rotation : 0,
      });
    }
    return out.length === 0 ? null : out;
  } catch {
    return null;
  }
}
