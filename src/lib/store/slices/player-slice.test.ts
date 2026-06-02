import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { clearHistory } from "@/lib/store/temporal";

function resetStore() {
  clearHistory();
  useStore.setState((s) => ({
    ...s,
    factPicker: null,
    contextMenu: null,
    stageContextMenu: null,
    replacePicker: null,
    annotationMode: false,
    helpOpen: false,
    pendingSymbolDelete: null,
    player: {
      open: false,
      mode: "hotspot",
      revealedFactId: null,
      sequentialIndex: 0,
    },
    ui: {
      ...s.ui,
      lastPlayerMode: "hotspot",
    },
  }));
}

describe("player slice", () => {
  beforeEach(() => {
    resetStore();
  });

  it("clears transient editor UI when entering study mode", () => {
    useStore.setState((s) => ({
      ...s,
      factPicker: { open: true, mode: "tag", symbolIds: ["symbol-a"] },
      contextMenu: { x: 1, y: 2, symbolId: "symbol-a" },
      stageContextMenu: { x: 3, y: 4, stageX: 5, stageY: 6 },
      replacePicker: { x: 7, y: 8, symbolId: "symbol-b" },
      annotationMode: true,
      helpOpen: true,
      pendingSymbolDelete: { ids: ["symbol-c"] },
      player: {
        open: false,
        mode: "hotspot",
        revealedFactId: "stale-fact",
        sequentialIndex: 9,
      },
      ui: {
        ...s.ui,
        lastPlayerMode: "sequential",
      },
    }));

    useStore.getState().enterPlayer();

    const state = useStore.getState();
    expect(state.factPicker).toBeNull();
    expect(state.contextMenu).toBeNull();
    expect(state.stageContextMenu).toBeNull();
    expect(state.replacePicker).toBeNull();
    expect(state.annotationMode).toBe(false);
    expect(state.helpOpen).toBe(false);
    expect(state.pendingSymbolDelete).toBeNull();
    expect(state.player).toEqual({
      open: true,
      mode: "sequential",
      revealedFactId: null,
      sequentialIndex: 0,
    });
  });
});
