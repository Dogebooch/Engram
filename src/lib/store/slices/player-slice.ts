import type { StateCreator } from "zustand";
import type { PlayerMode } from "./ui-slice";
import type { RootState } from "../types";

export interface PlayerState {
  /** Whether the Player overlay is currently mounted on top of the editor. */
  open: boolean;
  /** Active display mode within the player. */
  mode: PlayerMode;
  /** Hotspot mode: which fact's reveal card is currently shown (null = none). */
  revealedFactId: string | null;
  /** Sequential mode: index into the ordered fact list. */
  sequentialIndex: number;
}

export interface PlayerSlice {
  player: PlayerState;
  enterPlayer: () => void;
  exitPlayer: () => void;
  cyclePlayerMode: () => void;
  setPlayerMode: (mode: PlayerMode) => void;
  revealFact: (factId: string) => void;
  closeReveal: () => void;
  setSequentialIndex: (index: number) => void;
}

const initial: PlayerState = {
  open: false,
  mode: "hotspot",
  revealedFactId: null,
  sequentialIndex: 0,
};

export const createPlayerSlice: StateCreator<RootState, [], [], PlayerSlice> = (
  set,
  get,
) => ({
  player: initial,

  enterPlayer: () => {
    const ui = get().ui;
    set({
      player: {
        open: true,
        mode: ui.lastPlayerMode,
        revealedFactId: null,
        sequentialIndex: 0,
      },
    });
  },

  exitPlayer: () => {
    set((s) => ({ player: { ...s.player, open: false, revealedFactId: null } }));
  },

  cyclePlayerMode: () => {
    const next: PlayerMode =
      get().player.mode === "hotspot" ? "sequential" : "hotspot";
    get().setLastPlayerMode(next);
    set((s) => ({
      player: {
        ...s.player,
        mode: next,
        // Clear hotspot reveal when switching modes — Sequential has its own focus model.
        revealedFactId: null,
      },
    }));
  },

  setPlayerMode: (mode) => {
    get().setLastPlayerMode(mode);
    set((s) => ({
      player: { ...s.player, mode, revealedFactId: null },
    }));
  },

  revealFact: (factId) => {
    set((s) => ({ player: { ...s.player, revealedFactId: factId } }));
  },

  closeReveal: () => {
    set((s) => ({ player: { ...s.player, revealedFactId: null } }));
  },

  setSequentialIndex: (index) => {
    set((s) => ({
      player: { ...s.player, sequentialIndex: Math.max(0, index) },
    }));
  },
});
