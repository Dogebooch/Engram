"use client";

import * as React from "react";
import { isTypingTarget } from "@/lib/keybindings";
import { useStore } from "@/lib/store";

interface PlayerKeybindingsArgs {
  totalFacts: number;
  /** Called when the user wants to step backwards (sequential mode). */
  onPrev: () => void;
  /** Called when the user wants to step forwards (sequential mode). */
  onNext: () => void;
  /** Called when the user wants to jump to a specific 0-indexed fact. */
  onJumpTo: (index: number) => void;
}

/**
 * Player-only keybindings. Only registered while the player is open, so
 * `←`/`→` etc. never collide with editor or CodeMirror bindings.
 *
 * State (mode, revealedFactId) is read live from the store inside the
 * handler so back-to-back synthetic events (and very fast user repeats)
 * see the latest state, not a stale React-effect snapshot.
 */
export function usePlayerKeybindings({
  totalFacts,
  onPrev,
  onNext,
  onJumpTo,
}: PlayerKeybindingsArgs) {
  const open = useStore((s) => s.player.open);

  // Stable callbacks keep their latest closures via a ref so we don't
  // re-bind the document listener every render.
  const cbRef = React.useRef({ totalFacts, onPrev, onNext, onJumpTo });
  React.useEffect(() => {
    cbRef.current = { totalFacts, onPrev, onNext, onJumpTo };
  });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const s = useStore.getState();
      const cb = cbRef.current;

      if (e.key === "Escape") {
        if (s.player.mode === "hotspot" && s.player.revealedFactId) {
          e.preventDefault();
          s.closeReveal();
          return;
        }
        e.preventDefault();
        s.exitPlayer();
        return;
      }

      if (
        e.key.toLowerCase() === "m" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();
        s.cyclePlayerMode();
        return;
      }

      if (s.player.mode === "sequential") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          cb.onPrev();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          cb.onNext();
          return;
        }
      }

      if (/^[1-9]$/.test(e.key)) {
        const n = Number(e.key);
        if (n - 1 < cb.totalFacts) {
          e.preventDefault();
          cb.onJumpTo(n - 1);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
}
