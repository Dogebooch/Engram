"use client";

import * as React from "react";
import { parseBullet } from "@/lib/notes/bullet";
import type { ParsedFact } from "@/lib/notes/types";
import type { SymbolLayer } from "@/lib/types/canvas";
import { getSymbolById } from "@/lib/symbols";
import { useSymbolsReady } from "./use-symbols-ready";

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
      const lib = layer ? getSymbolById(layer.ref) : undefined;
      return {
        symbolId: ref.symbolId,
        bulletLine: ref.bulletLine,
        symbolName: lib?.displayName ?? null,
        imageUrl: lib?.imageUrl ?? null,
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
                  >
                    {e.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.imageUrl}
                        alt=""
                        className="eng-player-rail__tile-img"
                      />
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
