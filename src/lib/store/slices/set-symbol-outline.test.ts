import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import { clearHistory, getTemporal } from "@/lib/store/temporal";
import { isRegionSymbolLayer } from "@/lib/types/canvas";

function resetStore() {
  clearHistory();
  useStore.setState((s) => ({
    ...s,
    picmonics: {},
    currentPicmonicId: null,
    selectedSymbolIds: [],
    addSymbolTargetFactId: null,
    factPicker: null,
  }));
}

const TRI = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 8 },
];

describe("setSymbolOutline", () => {
  beforeEach(() => {
    resetStore();
  });

  it("replaces an image layer in-place with a region polygon of the same id", () => {
    const pid = useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 })!;

    // Put the image layer in a group + give it an animation field to verify preservation.
    useStore.getState().updateSymbol(layerId, { groupId: "g1", animation: "fade" });

    const notesBefore = useStore.getState().picmonics[pid].notes;
    const ok = useStore.getState().setSymbolOutline(layerId, {
      x: 5,
      y: 6,
      width: 40,
      height: 30,
      shape: "polygon",
      points: TRI,
    });

    expect(ok).toBe(true);
    const after = useStore.getState().picmonics[pid];
    expect(after.canvas.symbols).toHaveLength(1);
    const layer = after.canvas.symbols[0];
    expect(layer.id).toBe(layerId);
    expect(isRegionSymbolLayer(layer)).toBe(true);
    if (isRegionSymbolLayer(layer)) {
      expect(layer.shape).toBe("polygon");
      expect(layer.points).toEqual(TRI);
      expect(layer.ref).toBeNull();
    }
    // v2 scaffolding + grouping preserved across the replace.
    expect(layer.groupId).toBe("g1");
    expect(layer.animation).toBe("fade");
    // Notes are byte-identical — outline binding never edits the bullet.
    expect(after.notes).toBe(notesBefore);
    expect(useStore.getState().selectedSymbolIds).toEqual([layerId]);
  });

  it("creates a region with the exact id when no layer exists (broken bullet)", () => {
    const pid = useStore.getState().createPicmonic("test");
    const orphanId = "11111111-1111-4111-8111-111111111111";

    const ok = useStore.getState().setSymbolOutline(orphanId, {
      x: 1,
      y: 2,
      width: 20,
      height: 20,
      shape: "polygon",
      points: TRI,
    });

    expect(ok).toBe(true);
    const symbols = useStore.getState().picmonics[pid].canvas.symbols;
    expect(symbols).toHaveLength(1);
    expect(symbols[0].id).toBe(orphanId);
    expect(symbols[0].kind).toBe("region");
  });

  it("no-ops (returns false, no write) on an invalid polygon", () => {
    const pid = useStore.getState().createPicmonic("test");
    const before = useStore.getState().picmonics[pid].canvas.symbols.length;

    const ok = useStore.getState().setSymbolOutline("abc", {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      shape: "polygon",
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    });

    expect(ok).toBe(false);
    expect(useStore.getState().picmonics[pid].canvas.symbols).toHaveLength(before);
  });

  it("binds as a single undoable history entry", () => {
    useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 })!;
    const before = getTemporal().pastStates.length;

    useStore.getState().setSymbolOutline(layerId, {
      x: 0,
      y: 0,
      width: 30,
      height: 30,
      shape: "polygon",
      points: TRI,
    });

    expect(getTemporal().pastStates.length).toBe(before + 1);

    getTemporal().undo();
    const reverted = useStore
      .getState()
      .picmonics[useStore.getState().currentPicmonicId!].canvas.symbols[0];
    expect(reverted.kind).toBe("image");
  });
});
