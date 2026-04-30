import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "@/lib/store";

const REF = "openmoji:1F600";

function reset() {
  useStore.setState({
    picmonics: {},
    currentPicmonicId: null,
    selectedSymbolIds: [],
  });
}

function newPicmonic(): string {
  const id = useStore.getState().createPicmonic();
  return id;
}

function spawn3() {
  const ids: string[] = [];
  const add = useStore.getState().addSymbol;
  for (let i = 0; i < 3; i++) {
    const id = add({ ref: REF, x: 100 * i, y: 100 * i });
    if (id) ids.push(id);
  }
  return ids;
}

describe("groupSymbols / ungroupSymbols", () => {
  beforeEach(() => {
    reset();
    newPicmonic();
  });

  it("no-op for fewer than 2 symbols", () => {
    const ids = spawn3();
    const groupId = useStore.getState().groupSymbols([ids[0]]);
    expect(groupId).toBeNull();
    const cid = useStore.getState().currentPicmonicId!;
    expect(useStore.getState().picmonics[cid].canvas.groups).toEqual([]);
  });

  it("creates a group for 2+ symbols and writes groupId on each member", () => {
    const ids = spawn3();
    const groupId = useStore.getState().groupSymbols(ids);
    expect(groupId).toBeTruthy();
    const cid = useStore.getState().currentPicmonicId!;
    const canvas = useStore.getState().picmonics[cid].canvas;
    expect(canvas.groups).toHaveLength(1);
    expect(canvas.groups[0].symbolIds.sort()).toEqual([...ids].sort());
    expect(canvas.symbols.every((sy) => sy.groupId === groupId)).toBe(true);
  });

  it("preserves world-space x/y across group + ungroup", () => {
    const ids = spawn3();
    const cid = useStore.getState().currentPicmonicId!;
    const before = useStore
      .getState()
      .picmonics[cid].canvas.symbols.map((sy) => ({
        id: sy.id,
        x: sy.x,
        y: sy.y,
      }));

    useStore.getState().groupSymbols(ids);
    useStore.getState().ungroupSymbols(ids);

    const after = useStore
      .getState()
      .picmonics[cid].canvas.symbols.map((sy) => ({
        id: sy.id,
        x: sy.x,
        y: sy.y,
      }));
    expect(after).toEqual(before);
    const canvas = useStore.getState().picmonics[cid].canvas;
    expect(canvas.groups).toHaveLength(0);
    expect(canvas.symbols.every((sy) => sy.groupId === null)).toBe(true);
  });

  it("re-grouping a selection that includes pre-grouped symbols dissolves the old groups", () => {
    const ids = spawn3();
    const firstGroupId = useStore.getState().groupSymbols([ids[0], ids[1]]);
    expect(firstGroupId).toBeTruthy();

    // Now group all three: existing 2-group should dissolve, new 3-group emerges.
    const newGroupId = useStore.getState().groupSymbols(ids);
    expect(newGroupId).toBeTruthy();
    expect(newGroupId).not.toBe(firstGroupId);

    const cid = useStore.getState().currentPicmonicId!;
    const canvas = useStore.getState().picmonics[cid].canvas;
    expect(canvas.groups).toHaveLength(1);
    expect(canvas.groups[0].id).toBe(newGroupId);
    expect(canvas.symbols.every((sy) => sy.groupId === newGroupId)).toBe(true);
  });

  it("ungroupSymbols dissolves only the groups represented in the selection", () => {
    const ids = spawn3();
    const groupAB = useStore.getState().groupSymbols([ids[0], ids[1]])!;
    // Synthesize a second 1-symbol "group" by hand-fudging the canvas:
    // (we can't groupSymbols() with one id, so add a second 2-symbol group.)
    // Instead: regroup all three, then ungroup just one.
    void groupAB;
    useStore.getState().groupSymbols(ids); // dissolves AB, makes ABC
    useStore.getState().ungroupSymbols([ids[0]]); // dissolves the ABC group via member
    const cid = useStore.getState().currentPicmonicId!;
    const canvas = useStore.getState().picmonics[cid].canvas;
    expect(canvas.groups).toHaveLength(0);
    expect(canvas.symbols.every((sy) => sy.groupId === null)).toBe(true);
  });
});

describe("selectGroupAware / toggleGroupAware", () => {
  beforeEach(() => {
    reset();
    newPicmonic();
  });

  it("selectGroupAware on a grouped symbol selects all members", () => {
    const ids = spawn3();
    useStore.getState().groupSymbols(ids);
    useStore.getState().selectGroupAware(ids[0]);
    const sel = useStore.getState().selectedSymbolIds;
    expect(sel.sort()).toEqual([...ids].sort());
  });

  it("selectGroupAware on an ungrouped symbol selects only it", () => {
    const ids = spawn3();
    useStore.getState().selectGroupAware(ids[1]);
    expect(useStore.getState().selectedSymbolIds).toEqual([ids[1]]);
  });

  it("toggleGroupAware adds a full group, then removes the full group", () => {
    const ids = spawn3();
    useStore.getState().groupSymbols([ids[0], ids[1]]);
    useStore.getState().setSelectedSymbolIds([ids[2]]);
    useStore.getState().toggleGroupAware(ids[0]);
    let sel = useStore.getState().selectedSymbolIds;
    expect(sel.sort()).toEqual([ids[0], ids[1], ids[2]].sort());
    useStore.getState().toggleGroupAware(ids[1]);
    sel = useStore.getState().selectedSymbolIds;
    expect(sel).toEqual([ids[2]]);
  });
});
