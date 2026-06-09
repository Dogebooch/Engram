import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import { clearHistory, getTemporal } from "@/lib/store/temporal";
import { isImageSymbolLayer } from "@/lib/types/canvas";

function resetStore() {
  clearHistory();
  useStore.setState((s) => ({
    ...s,
    picmonics: {},
    currentPicmonicId: null,
    selectedSymbolIds: [],
    ui: { ...s.ui, recentSymbolIds: [] },
  }));
}

const TRI = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 8 },
];

describe("assignSymbolImage", () => {
  beforeEach(() => {
    resetStore();
  });

  it("replaces a region placeholder in-place with an image, keeping id + geometry", () => {
    const pid = useStore.getState().createPicmonic("test");
    // A facts-only placeholder: a rect region at a specific box, in a group.
    const placeholderId = "11111111-1111-4111-8111-111111111111";
    useStore.getState().setSymbolOutline(placeholderId, {
      x: 80,
      y: 60,
      width: 300,
      height: 200,
      shape: "rect",
    });
    useStore.getState().updateSymbol(placeholderId, { groupId: "g1" });

    const notesBefore = useStore.getState().picmonics[pid].notes;
    useStore.getState().assignSymbolImage(placeholderId, "openmoji:1F436");

    const after = useStore.getState().picmonics[pid];
    expect(after.canvas.symbols).toHaveLength(1);
    const layer = after.canvas.symbols[0];
    expect(layer.id).toBe(placeholderId);
    expect(isImageSymbolLayer(layer)).toBe(true);
    if (isImageSymbolLayer(layer)) {
      expect(layer.ref).toBe("openmoji:1F436");
    }
    // The placeholder box + grouping are preserved across the swap.
    expect(layer.x).toBe(80);
    expect(layer.y).toBe(60);
    expect(layer.width).toBe(300);
    expect(layer.height).toBe(200);
    expect(layer.groupId).toBe("g1");
    // Notes untouched — the bullet already exists.
    expect(after.notes).toBe(notesBefore);
    // Selected + pushed to recents.
    expect(useStore.getState().selectedSymbolIds).toEqual([placeholderId]);
    expect(useStore.getState().ui.recentSymbolIds[0]).toBe("openmoji:1F436");
  });

  it("creates a centered image when no layer exists for the bullet id", () => {
    const pid = useStore.getState().createPicmonic("test");
    const orphanId = "22222222-2222-4222-8222-222222222222";

    useStore.getState().assignSymbolImage(orphanId, "user:abc");

    const symbols = useStore.getState().picmonics[pid].canvas.symbols;
    expect(symbols).toHaveLength(1);
    expect(symbols[0].id).toBe(orphanId);
    expect(symbols[0].kind).toBe("image");
    // Not at 0,0 — centered on the stage.
    expect(symbols[0].x).toBeGreaterThan(0);
    expect(symbols[0].y).toBeGreaterThan(0);
  });

  it("no-ops when the layer is already an image with the same ref", () => {
    useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({
      ref: "openmoji:1F436",
      x: 100,
      y: 100,
    })!;
    const before = getTemporal().pastStates.length;

    useStore.getState().assignSymbolImage(layerId, "openmoji:1F436");

    expect(getTemporal().pastStates.length).toBe(before);
  });

  it("converts a polygon region back to an image as a single undo entry", () => {
    const pid = useStore.getState().createPicmonic("test");
    const layerId = addSymbolWithNoteSync({
      ref: "openmoji:1F436",
      x: 100,
      y: 100,
    })!;
    useStore.getState().setSymbolOutline(layerId, {
      x: 5,
      y: 6,
      width: 40,
      height: 30,
      shape: "polygon",
      points: TRI,
    });
    const before = getTemporal().pastStates.length;

    useStore.getState().assignSymbolImage(layerId, "user:xyz");

    expect(getTemporal().pastStates.length).toBe(before + 1);
    const layer = useStore.getState().picmonics[pid].canvas.symbols[0];
    expect(layer.kind).toBe("image");
    if (isImageSymbolLayer(layer)) expect(layer.ref).toBe("user:xyz");
  });
});
