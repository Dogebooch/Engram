"use client";

import { get as idbGet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { useIndexStore } from "@/lib/store/index-store";
import { useStore } from "@/lib/store";
import type { Picmonic } from "@/lib/types/picmonic";

export interface AssetUsage {
  picmonicId: string;
  name: string;
}

/**
 * Find every picmonic whose canvas references the given symbol id (e.g.
 * "user:<uuid>"). Checks live store state first, then falls back to IDB
 * for picmonics not currently hydrated.
 */
export async function findPicmonicsUsingSymbol(
  symbolId: string,
): Promise<AssetUsage[]> {
  const out: AssetUsage[] = [];
  const seen = new Set<string>();
  const livePicmonics = useStore.getState().picmonics;
  for (const [id, p] of Object.entries(livePicmonics)) {
    if (canvasUses(p, symbolId)) {
      out.push({ picmonicId: id, name: p.meta.name });
      seen.add(id);
    }
  }
  const index = useIndexStore.getState().index ?? [];
  for (const entry of index) {
    if (seen.has(entry.id)) continue;
    try {
      const stored = await idbGet<Picmonic>(picmonicKey(entry.id));
      if (stored && canvasUses(stored, symbolId)) {
        out.push({ picmonicId: entry.id, name: entry.name });
      }
    } catch (err) {
      console.warn(`[engram] usage scan failed for ${entry.id}`, err);
    }
  }
  return out;
}

function canvasUses(p: Picmonic, symbolId: string): boolean {
  return p.canvas.symbols.some((s) => s.ref === symbolId);
}
