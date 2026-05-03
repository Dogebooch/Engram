import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import { clearHistory, getTemporal } from "@/lib/store/temporal";

function resetStore() {
  clearHistory();
  useStore.setState((s) => ({
    ...s,
    picmonics: {},
    currentPicmonicId: null,
    selectedSymbolIds: [],
  }));
}

describe("cross-pane atomic undo", () => {
  beforeEach(() => {
    resetStore();
  });

  it("undo restores a deleted symbol AND its bullet (delete)", () => {
    const id = useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 });
    expect(layerId).toBeTruthy();

    const beforeDelete = useStore.getState().picmonics[id];
    expect(beforeDelete.canvas.symbols).toHaveLength(1);
    expect(beforeDelete.notes).toContain(`{sym:${layerId}}`);

    useStore.getState().deleteSymbols([layerId!]);
    const afterDelete = useStore.getState().picmonics[id];
    expect(afterDelete.canvas.symbols).toHaveLength(0);
    expect(afterDelete.notes).not.toContain(`{sym:${layerId}}`);

    getTemporal().undo();
    const afterUndo = useStore.getState().picmonics[id];
    expect(afterUndo.canvas.symbols).toHaveLength(1);
    expect(afterUndo.canvas.symbols[0].id).toBe(layerId);
    expect(afterUndo.notes).toContain(`{sym:${layerId}}`);
  });

  it("undo removes symbol AND bullet added via addSymbolWithNoteSync", () => {
    const id = useStore.getState().createPicmonic("test");
    const baselineNotes = useStore.getState().picmonics[id].notes;
    const baselineSymbolCount = useStore.getState().picmonics[id].canvas.symbols.length;

    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 50, y: 50 });
    expect(layerId).toBeTruthy();

    const after = useStore.getState().picmonics[id];
    expect(after.canvas.symbols.length).toBeGreaterThan(baselineSymbolCount);
    expect(after.notes).toContain(`{sym:${layerId}}`);

    getTemporal().undo();
    const afterUndo = useStore.getState().picmonics[id];
    expect(afterUndo.canvas.symbols.length).toBe(baselineSymbolCount);
    expect(afterUndo.notes).toBe(baselineNotes);
  });

  it("redo replays the change", () => {
    const id = useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 });
    useStore.getState().deleteSymbols([layerId!]);

    getTemporal().undo();
    const afterUndo = useStore.getState().picmonics[id];
    expect(afterUndo.canvas.symbols).toHaveLength(1);

    getTemporal().redo();
    const afterRedo = useStore.getState().picmonics[id];
    expect(afterRedo.canvas.symbols).toHaveLength(0);
    expect(afterRedo.notes).not.toContain(`{sym:${layerId}}`);
  });

  it("equality dedupes no-op updateSymbol calls (no history pollution)", () => {
    useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 });
    const sizeAfterAdd = getTemporal().pastStates.length;

    // Repeatedly "set" the same x/y. With the no-op guard, no entry is pushed.
    useStore.getState().updateSymbol(layerId!, { x: 100, y: 100 });
    useStore.getState().updateSymbol(layerId!, { x: 100, y: 100 });
    useStore.getState().updateSymbol(layerId!, { x: 100, y: 100 });

    expect(getTemporal().pastStates.length).toBe(sizeAfterAdd);
  });

  it("real updateSymbol move pushes one history entry", () => {
    useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 });
    const before = getTemporal().pastStates.length;

    useStore.getState().updateSymbol(layerId!, { x: 250, y: 175 });

    expect(getTemporal().pastStates.length).toBe(before + 1);

    getTemporal().undo();
    const sym = useStore.getState().picmonics[useStore.getState().currentPicmonicId!]
      .canvas.symbols.find((s) => s.id === layerId);
    expect(sym?.x).toBe(100);
    expect(sym?.y).toBe(100);
  });

  it("clearHistory wipes the stack (used on picmonic switch)", () => {
    useStore.getState().createPicmonic("test");
    addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 });
    expect(getTemporal().pastStates.length).toBeGreaterThan(0);

    clearHistory();
    expect(getTemporal().pastStates.length).toBe(0);
    expect(getTemporal().futureStates.length).toBe(0);
  });

  it("paused history does not record while pause is active", () => {
    useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({ ref: "openmoji:1F436", x: 100, y: 100 });
    const sizeBefore = getTemporal().pastStates.length;

    getTemporal().pause();
    useStore.getState().updateSymbol(layerId!, { x: 200, y: 200 });
    useStore.getState().updateSymbol(layerId!, { x: 300, y: 300 });
    getTemporal().resume();

    expect(getTemporal().pastStates.length).toBe(sizeBefore);
  });
});
