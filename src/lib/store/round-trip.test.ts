/**
 * Round-trip data safety: a mutation, then a forced flush (the path the
 * brand-button "go home" callback takes via `flushPendingSave` +
 * `flushIndexPersist`), must leave IDB holding the mutation. A subsequent
 * cold read must rehydrate the same shape.
 *
 * The React-side debounce hook (`useDebouncedPicmonicSave`) is verified
 * separately via the manual preview pass — this test exercises the IDB
 * persistence + rehydration contract that backs it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clear as idbClear, get as idbGet } from "idb-keyval";
import { picmonicKey } from "@/lib/constants";
import { useStore } from "./index";
import { saveCurrentPicmonicNow } from "./save-now";
import { flushIndexPersist, useIndexStore } from "./index-store";
import type { Picmonic } from "@/lib/types/picmonic";

beforeEach(async () => {
  await idbClear();
  // Reset both stores so tests don't leak state through the module-level singletons.
  useStore.setState({ picmonics: {}, currentPicmonicId: null });
  useIndexStore.setState({ index: null, loading: false });
});

afterEach(async () => {
  await idbClear();
});

describe("editor → home round-trip", () => {
  it("persists mid-edit canvas mutations through a forced flush", async () => {
    const s = useStore.getState();
    const id = s.createPicmonic("Round-trip subject");
    s.setCurrentPicmonic(id);

    s.addSymbol({ ref: "openmoji:1F982", x: 100, y: 200 });
    const beforeSave = useStore.getState().picmonics[id];
    expect(beforeSave?.canvas.symbols).toHaveLength(1);

    // Simulate goHome's flush: explicit save (the path flushPendingSave takes
    // when the debounce timer fires) + index persist.
    const ok = await saveCurrentPicmonicNow();
    expect(ok).toBe(true);
    await flushIndexPersist();

    const stored = await idbGet<Picmonic>(picmonicKey(id));
    expect(stored).toBeTruthy();
    expect(stored?.canvas.symbols).toHaveLength(1);
    expect(stored?.canvas.symbols[0]?.x).toBe(100);
    expect(stored?.canvas.symbols[0]?.y).toBe(200);
    expect(stored?.canvas.symbols[0]?.ref).toBe("openmoji:1F982");
  });

  it("re-opening hydrates the same canvas + notes from IDB", async () => {
    const s = useStore.getState();
    const id = s.createPicmonic("Hydration subject");
    s.setCurrentPicmonic(id);
    s.addSymbol({ ref: "openmoji:1F4A1", x: 42, y: 84 });
    s.setNotes(id, "# Section\n## Fact\n\n* {sym:abc} eye → vision\n");

    await saveCurrentPicmonicNow();
    await flushIndexPersist();

    // Drop in-memory state — simulating a tab close + cold reopen.
    useStore.setState({ picmonics: {}, currentPicmonicId: null });

    const stored = await idbGet<Picmonic>(picmonicKey(id));
    expect(stored).toBeTruthy();
    if (!stored) return;
    useStore.getState().hydratePicmonic(stored);
    useStore.getState().setCurrentPicmonic(id);

    const after = useStore.getState().picmonics[id];
    expect(after?.canvas.symbols).toHaveLength(1);
    expect(after?.canvas.symbols[0]?.ref).toBe("openmoji:1F4A1");
    expect(after?.notes).toContain("{sym:abc} eye");
    expect(after?.meta.name).toBe("Hydration subject");
  });

  it("flushIndexPersist forces the 250ms debounce to land synchronously", async () => {
    const entry = {
      id: "x",
      name: "Indexed",
      tags: [],
      createdAt: 1,
      updatedAt: 2,
      thumbDataUrl: null,
      symbolCount: 0,
      factCount: 0,
    };
    useIndexStore.getState().upsertIndexEntry(entry);

    // Without the flush, the 250ms debounce hasn't fired yet — IDB is empty.
    const beforeFlush = await idbGet<unknown[]>("engram:picmonic-index:v1");
    expect(beforeFlush ?? null).toBeNull();

    await flushIndexPersist();

    const afterFlush = await idbGet<typeof entry[]>("engram:picmonic-index:v1");
    expect(afterFlush).toEqual([entry]);
  });
});
