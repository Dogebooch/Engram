import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clear as idbClear,
  get as idbGet,
  set as idbSet,
} from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { emptyCanvas } from "@/lib/types/canvas";
import type { Picmonic } from "@/lib/types/picmonic";
import type { SourceVideoProvenance } from "@/lib/types/source-video";
import { entryFromPicmonic, useIndexStore } from "../index-store";
import { useStore } from "../index";

const sourceVideo: SourceVideoProvenance = {
  provider: "mvs",
  id: 5,
  title: "2nd Generation Cephalosporin",
  path: "P:\\Medicine Videos\\Picmonic\\Picmonic\\2nd Generation Cephalosporin.mov",
  source: "Picmonic",
  course: "Picmonic",
  importedAt: 1_700_000_000_000,
  confidence: "matched",
};

function makePicmonic(overrides: Partial<Picmonic> = {}): Picmonic {
  return {
    id: "picmonic-1",
    meta: {
      name: "Imported",
      tags: [],
      folderId: null,
      sourceVideo,
      createdAt: 1,
      updatedAt: 1,
    },
    notes: "",
    canvas: emptyCanvas(),
    ...overrides,
  };
}

beforeEach(async () => {
  await idbClear();
  useIndexStore.setState({ index: [], folders: [], loading: false });
  useStore.setState({
    picmonics: {},
    currentPicmonicId: null,
    saveStatus: "idle",
    lastSavedAt: null,
  });
});

afterEach(async () => {
  await idbClear();
});

describe("picmonic folder and import provenance mutations", () => {
  it("moves a Picmonic between folders and persists IDB plus index", async () => {
    const picmonic = makePicmonic();
    await idbSet(picmonicKey(picmonic.id), picmonic);
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(picmonic, null));

    await expect(
      useStore.getState().setPicmonicFolder(picmonic.id, "folder-a"),
    ).resolves.toBe(true);

    const stored = await idbGet<Picmonic>(picmonicKey(picmonic.id));
    expect(stored?.meta.folderId).toBe("folder-a");
    expect(useIndexStore.getState().index?.[0]?.folderId).toBe("folder-a");
  });

  it("duplicates a Picmonic with folder placement but without import count", async () => {
    const picmonic = makePicmonic({
      meta: {
        ...makePicmonic().meta,
        folderId: "folder-a",
        sourceVideo,
      },
    });
    await idbSet(picmonicKey(picmonic.id), picmonic);

    const copyId = await useStore.getState().duplicatePicmonic(picmonic.id);

    expect(copyId).toBeTruthy();
    const copy = await idbGet<Picmonic>(picmonicKey(copyId!));
    expect(copy?.meta.folderId).toBe("folder-a");
    expect(copy?.meta.sourceVideo).toBeNull();
    expect(useIndexStore.getState().index?.find((e) => e.id === copyId)?.sourceVideo).toBeNull();
  });

  it("deleting an imported Picmonic removes the only checklist provenance row", async () => {
    const picmonic = makePicmonic();
    await idbSet(picmonicKey(picmonic.id), picmonic);
    useStore.setState({ picmonics: { [picmonic.id]: picmonic } });
    useIndexStore.getState().upsertIndexEntry(entryFromPicmonic(picmonic, null));

    await useStore.getState().deletePicmonic(picmonic.id);

    expect(useIndexStore.getState().index).toEqual([]);
    expect(await idbGet<Picmonic>(picmonicKey(picmonic.id))).toBeUndefined();
  });
});
