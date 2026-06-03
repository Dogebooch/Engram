"use client";

import * as React from "react";
import { parseBullet } from "@/lib/notes/bullet";
import type { ParsedFact } from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { getSymbolById, useSymbolsReady } from "@/lib/symbols";

interface SequentialRailProps {
  fact: ParsedFact | null;
  ordinal: number; // 1-indexed
  total: number;
  notes: string;
  /** Canvas symbols, used to resolve the symbol UUID → library ref → entry. */
  canvasSymbols: readonly SymbolLayer[];
}

export function SequentialRail({
  fact,
  ordinal,
  total,
  notes,
  canvasSymbols,
}: SequentialRailProps) {
  const symbolsReady = useSymbolsReady();
  const symbolsById = React.useMemo(() => {
    const m = new Map<string, SymbolLayer>();
    for (const s of canvasSymbols) m.set(s.id, s);
    return m;
  }, [canvasSymbols]);

  const entries = React.useMemo(() => {
    if (!fact) return [];
    const lines = notes.split("\n");
    return fact.symbolRefs.map((ref) => {
      const line = lines[ref.bulletLine - 1] ?? "";
      const parts = parseBullet(line);
      const layer = symbolsById.get(ref.symbolId);
      const isRegion = layer?.kind === "region";
      const lib = !isRegion && layer ? getSymbolById(layer.ref) : undefined;
      return {
        symbolId: ref.symbolId,
        bulletLine: ref.bulletLine,
        // Regions don't have a library entry; the rail badges them as
        // "region" so the sequential card doesn't read as a broken symbol.
        symbolName: isRegion ? "region" : (lib?.displayName ?? null),
        imageUrl: isRegion ? null : (lib?.imageUrl ?? null),
        isRegion,
        description: parts.description,
        meaning: parts.meaning,
        encoding: parts.encoding,
      };
    });
    // symbolsReady is read-only side-effect — rebuilds the memo when the cache
    // populates so MISSING placeholders flip to real names.
    void symbolsReady;
  }, [fact, notes, symbolsById, symbolsReady]);

  return (
    <aside
      className="eng-player-rail"
      role="complementary"
      aria-label="Fact details"
    >
      <div className="eng-player-rail__inner">
        {fact ? (
          <>
            <div className="eng-player-rail__header">
              {fact.sectionName ? (
                <>
                  <span className="eng-player-rail__section">
                    {fact.sectionName}
                  </span>
                  <span className="eng-player-rail__sep">›</span>
                </>
              ) : (
                <span
                  className="eng-player-rail__section"
                  data-empty="true"
                >
                  no section
                </span>
              )}
              <span className="eng-player-rail__index">
                {String(ordinal).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </span>
            </div>

            <h2 className="eng-player-rail__name">{fact.name}</h2>

            {entries.length > 0 && (
              <div className="eng-player-rail__symbol-grid">
                {entries.map((e, i) => (
                  <div
                    key={`${e.symbolId}-${i}-tile`}
                    className="eng-player-rail__tile"
                    data-region={e.isRegion ? "true" : undefined}
                  >
                    {e.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.imageUrl}
                        alt=""
                        className="eng-player-rail__tile-img"
                      />
                    ) : e.isRegion ? (
                      // Region tile: small inline polygon glyph reads as
                      // "traced shape" — distinct from missing/broken.
                      <svg
                        viewBox="0 0 32 32"
                        className="eng-player-rail__tile-img-region"
                        aria-hidden
                      >
                        <polygon
                          points="6,11 16,4 26,8 28,21 19,28 8,25 4,17"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span
                        className="eng-player-rail__tile-img-missing"
                        aria-hidden
                      >
                        ?
                      </span>
                    )}
                    <span className="eng-player-rail__tile-caption">
                      {e.symbolName ?? "missing"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="eng-player-rail__body">
              {entries.length === 0 ? (
                <div className="eng-player-rail__empty">
                  <span className="eng-player-rail__empty-caret">▍</span>
                  no symbols tagged
                </div>
              ) : (
                entries.map((e, i) => (
                  <div
                    key={`${e.symbolId}-${i}-block`}
                    className="eng-player-rail__symbol-block"
                  >
                    {e.symbolName && (
                      <div className="eng-player-rail__symbol-label">
                        {e.symbolName}
                      </div>
                    )}
                    {e.description && (
                      <div className="eng-player-rail__description">
                        {e.description}
                      </div>
                    )}
                    {e.meaning && (
                      <div className="eng-player-rail__meaning">
                        {e.meaning}
                      </div>
                    )}
                    {e.encoding && (
                      <div className="eng-player-rail__encoding">
                        <span className="eng-player-rail__encoding-mark">
                          ~
                        </span>
                        <span>{e.encoding}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="eng-player-rail__empty">
            <span className="eng-player-rail__empty-caret">▍</span>
            no fact selected
          </div>
        )}
      </div>
    </aside>
  );
}
