"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { parseNotes } from "@/lib/notes/parse";
import { getOrderedFacts } from "@/lib/notes/fact-order";
import type { SymbolLayer } from "@/lib/types/canvas";
import { PlayerStage } from "./player-stage";
import { PlayerTopbar } from "./player-topbar";
import { SequentialControls } from "./sequential-controls";
import { SequentialRail } from "./sequential-rail";
import { usePlayerKeybindings } from "./use-player-keybindings";

const EMPTY_SYMBOLS: readonly SymbolLayer[] = [];

export function PlayerOverlay() {
  const open = useStore((s) => s.player.open);
  if (!open) return null;
  return <PlayerOverlayInner />;
}

function PlayerOverlayInner() {
  const picmonic = usePicmonic();
  const player = useStore((s) => s.player);
  const setSequentialIndex = useStore((s) => s.setSequentialIndex);
  const revealFact = useStore((s) => s.revealFact);

  const notes = picmonic?.notes ?? "";
  const canvasSymbols = picmonic?.canvas.symbols ?? EMPTY_SYMBOLS;
  const parsed = React.useMemo(() => parseNotes(notes), [notes]);
  const orderedFacts = React.useMemo(
    () => getOrderedFacts(parsed),
    [parsed],
  );
  const totalFacts = orderedFacts.length;

  // Clamp sequentialIndex if facts disappeared underfoot
  React.useEffect(() => {
    if (player.mode !== "sequential") return;
    if (totalFacts === 0) return;
    if (player.sequentialIndex >= totalFacts) {
      setSequentialIndex(totalFacts - 1);
    }
  }, [player.mode, player.sequentialIndex, totalFacts, setSequentialIndex]);

  const onPrev = React.useCallback(() => {
    if (player.sequentialIndex <= 0) return;
    setSequentialIndex(player.sequentialIndex - 1);
  }, [player.sequentialIndex, setSequentialIndex]);

  const onNext = React.useCallback(() => {
    if (player.sequentialIndex >= totalFacts - 1) return;
    setSequentialIndex(player.sequentialIndex + 1);
  }, [player.sequentialIndex, totalFacts, setSequentialIndex]);

  const onJumpTo = React.useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= totalFacts) return;
      if (player.mode === "hotspot") {
        revealFact(orderedFacts[idx].factId);
      } else {
        setSequentialIndex(idx);
      }
    },
    [player.mode, orderedFacts, totalFacts, revealFact, setSequentialIndex],
  );

  usePlayerKeybindings({
    totalFacts,
    onPrev,
    onNext,
    onJumpTo,
  });

  const currentFact =
    player.mode === "sequential"
      ? orderedFacts[player.sequentialIndex] ?? null
      : null;

  const hasFacts = totalFacts > 0;

  return (
    <div
      className="eng-player-overlay"
      role="presentation"
      data-rail-open={
        player.mode === "sequential" && hasFacts ? "" : undefined
      }
    >
      <PlayerTopbar
        totalFacts={totalFacts}
        sequentialIndex={player.sequentialIndex}
      />
      {hasFacts ? (
        <>
          <PlayerStage />
          {player.mode === "sequential" && (
            <>
              <SequentialRail
                fact={currentFact}
                ordinal={player.sequentialIndex + 1}
                total={totalFacts}
                notes={notes}
                canvasSymbols={canvasSymbols}
              />
              <SequentialControls
                index={player.sequentialIndex}
                total={totalFacts}
                onPrev={onPrev}
                onNext={onNext}
                hasRail
              />
            </>
          )}
        </>
      ) : (
        <PlayerEmptyState />
      )}
    </div>
  );
}

function PlayerEmptyState() {
  return (
    <div className="eng-player-empty" role="status">
      <span className="eng-player-empty__caret" aria-hidden>
        ▍
      </span>
      <span className="eng-player-empty__title">no facts yet</span>
      <p className="eng-player-empty__hint">
        Add a <code>## Fact heading</code> in the notes panel and tag a few
        symbols to start studying. Press <code>Esc</code> to return to the editor.
      </p>
    </div>
  );
}
