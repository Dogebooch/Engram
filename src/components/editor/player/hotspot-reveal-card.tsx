"use client";

import * as React from "react";
import { parseBullet } from "@/lib/notes/bullet";
import type { ParsedFact, ParsedSymbolRef } from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { getSymbolById, useSymbolsReady } from "@/lib/symbols";

const CARD_WIDTH = 320;
const CARD_GAP = 18; // distance from hotspot center to card edge

export interface HotspotRevealCardProps {
  fact: ParsedFact;
  ordinal: number;
  notes: string;
  /** Canvas symbols, used to resolve the symbol UUID → library ref → entry. */
  canvasSymbols: readonly SymbolLayer[];
  /** Hotspot anchor in viewport (screen) pixels. */
  anchor: { x: number; y: number };
  /** Available viewport area for smart-flip. */
  viewport: { width: number; height: number };
}

interface BulletEntry {
  ref: ParsedSymbolRef;
  symbolName: string;
  description: string;
  meaning: string | null;
  encoding: string | null;
}

export function HotspotRevealCard({
  fact,
  ordinal,
  notes,
  canvasSymbols,
  anchor,
  viewport,
}: HotspotRevealCardProps) {
  const symbolsReady = useSymbolsReady();
  const symbolsById = React.useMemo(() => {
    const m = new Map<string, SymbolLayer>();
    for (const s of canvasSymbols) m.set(s.id, s);
    return m;
  }, [canvasSymbols]);

  const entries = React.useMemo<BulletEntry[]>(() => {
    const lines = notes.split("\n");
    return fact.symbolRefs.map((ref) => {
      const line = lines[ref.bulletLine - 1] ?? "";
      const parts = parseBullet(line);
      const layer = symbolsById.get(ref.symbolId);
      const lib = layer ? getSymbolById(layer.ref) : undefined;
      return {
        ref,
        symbolName: lib?.displayName ?? "untagged symbol",
        description: parts.description || lib?.displayName || "",
        meaning: parts.meaning,
        encoding: parts.encoding,
      };
    });
    void symbolsReady;
  }, [fact.symbolRefs, notes, symbolsById, symbolsReady]);

  // Smart placement: prefer right of anchor, flip to left if it would clip.
  const placement = React.useMemo(() => {
    const padding = 16;
    const wantRight = anchor.x + CARD_GAP + CARD_WIDTH + padding;
    const flipsLeft = wantRight > viewport.width;
    const left = flipsLeft
      ? Math.max(padding, anchor.x - CARD_GAP - CARD_WIDTH)
      : anchor.x + CARD_GAP;
    // Vertically center on hotspot, then clamp to viewport.
    // We can't know card height up-front; bias toward "above-center" so the
    // header sits closer to the anchor.
    const approxHeight = 96 + entries.length * 84; // rough estimate
    let top = anchor.y - approxHeight / 2;
    if (top < padding) top = padding;
    if (top + approxHeight > viewport.height - padding) {
      top = Math.max(padding, viewport.height - padding - approxHeight);
    }
    return { left, top };
  }, [anchor, viewport, entries.length]);

  return (
    <div
      className="eng-hotspot-card"
      role="dialog"
      aria-label={`Fact ${ordinal}: ${fact.name}`}
      style={{ left: placement.left, top: placement.top, width: CARD_WIDTH }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="eng-hotspot-card__header">
        <span className="eng-hotspot-card__index">
          {String(ordinal).padStart(2, "0")}
        </span>
        {fact.sectionName && (
          <span className="eng-hotspot-card__section">{fact.sectionName}</span>
        )}
      </div>
      <div className="eng-hotspot-card__name">{fact.name}</div>
      <div className="eng-hotspot-card__hairline" />
      {entries.length === 0 ? (
        <div className="eng-hotspot-card__description">
          (no symbols linked to this fact)
        </div>
      ) : (
        entries.map((e, i) => (
          <div
            key={`${e.ref.symbolId}-${i}`}
            className="eng-hotspot-card__symbol"
          >
            {e.description && (
              <div className="eng-hotspot-card__description">
                {e.description}
              </div>
            )}
            {e.meaning && (
              <div className="eng-hotspot-card__meaning">
                <span className="eng-hotspot-card__meaning-mark">→</span>
                {e.meaning}
              </div>
            )}
            {e.encoding && (
              <div className="eng-hotspot-card__encoding">
                <span className="eng-hotspot-card__encoding-mark">~</span>
                <span>{e.encoding}</span>
              </div>
            )}
          </div>
        ))
      )}
      {entries.length > 1 && (
        <div className="eng-hotspot-card__footer">
          {entries.length} symbols · esc closes
        </div>
      )}
    </div>
  );
}
