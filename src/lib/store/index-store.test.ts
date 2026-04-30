import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clear as idbClear,
  get as idbGet,
  set as idbSet,
} from "idb-keyval";
import { IDB_KEYS, picmonicKey } from "@/lib/constants";
import {
  entryFromPicmonic,
  useIndexStore,
} from "./index-store";
import type { Picmonic } from "@/lib/types/picmonic";
import type { PicmonicIndex } from "@/lib/types/index-entry";
import { emptyCanvas } from "@/lib/types/canvas";

function makePicmonic(id: string, name: string, t = 100): Picmonic {
  return {
    id,
    meta: { name, tags: [], createdAt: t, updatedAt: t },
    notes: "",
    canvas: emptyCanvas(),
  };
}

async function flushDebounce() {
  await new Promise((r) => setTimeout(r, 300));
}

beforeEach(async () => {
  await idbClear();
  // Reset zustand store between tests
  useIndexStore.setState({ index: null, loading: false });
});

afterEach(async () => {
  await idbClear();
});

describe("useIndexStore", () => {
  it("loads existing index from IDB", async () => {
    const seeded: PicmonicIndex = [
      {
        id: "a",
        name: "Alpha",
        tags: ["x"],
        createdAt: 1,
        updatedAt: 2,
        thumbDataUrl: null,
        symbolCount: 0,
        factCount: 0,
      },
    ];
    await idbSet(IDB_KEYS.picmonicIndex, seeded);
    await useIndexStore.getState().loadIndex();
    expect(useIndexStore.getState().index).toEqual(seeded);
  });

  it("migrates from raw picmonic:* keys when index is missing", async () => {
    const p1 = makePicmonic("aaa", "First", 10);
    const p2 = makePicmonic("bbb", "Second", 20);
    await idbSet(picmonicKey(p1.id), p1);
    await idbSet(picmonicKey(p2.id), p2);
    await useIndexStore.getState().loadIndex();
    const idx = useIndexStore.getState().index;
    expect(idx).not.toBeNull();
    expect(idx).toHaveLength(2);
    const ids = idx!.map((e) => e.id).sort();
    expect(ids).toEqual(["aaa", "bbb"]);
    // Persisted to IDB
    const stored = await idbGet<PicmonicIndex>(IDB_KEYS.picmonicIndex);
    expect(stored).not.toBeUndefined();
  });

  it("upsertIndexEntry dedups by id and sorts by updatedAt desc", async () => {
    useIndexStore.setState({ index: [], loading: false });
    const a: ReturnType<typeof entryFromPicmonic> = entryFromPicmonic(
      makePicmonic("a", "A", 100),
      null,
    );
    const b = entryFromPicmonic(makePicmonic("b", "B", 200), null);
    useIndexStore.getState().upsertIndexEntry(a);
    useIndexStore.getState().upsertIndexEntry(b);
    expect(useIndexStore.getState().index!.map((e) => e.id)).toEqual(["b", "a"]);

    const aUpdated = entryFromPicmonic(makePicmonic("a", "A2", 300), null);
    useIndexStore.getState().upsertIndexEntry(aUpdated);
    const idx = useIndexStore.getState().index!;
    expect(idx).toHaveLength(2);
    expect(idx[0].id).toBe("a");
    expect(idx[0].name).toBe("A2");

    await flushDebounce();
    const stored = await idbGet<PicmonicIndex>(IDB_KEYS.picmonicIndex);
    expect(stored).toBeDefined();
    expect(stored!.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("removeIndexEntry drops the row", async () => {
    useIndexStore.setState({
      index: [
        entryFromPicmonic(makePicmonic("a", "A"), null),
        entryFromPicmonic(makePicmonic("b", "B"), null),
      ],
      loading: false,
    });
    useIndexStore.getState().removeIndexEntry("a");
    expect(useIndexStore.getState().index!.map((e) => e.id)).toEqual(["b"]);
  });
});
