import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clear as idbClear } from "idb-keyval";
import { useStore } from "@/lib/store";
import { clearHistory } from "@/lib/store/temporal";
import { __resetSymbolsCacheForTests } from "@/lib/symbols/load";
import { __resetUserAssetsLoadForTests } from "@/lib/user-assets/load";
import { __resetUserAssetStoreForTests } from "@/lib/user-assets/store";
import { pasteImageFilesIntoCanvas } from "./paste-image";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function pngFile(name: string): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

function resetStore() {
  clearHistory();
  useStore.setState((s) => ({
    ...s,
    picmonics: {},
    currentPicmonicId: null,
    selectedSymbolIds: [],
    annotationMode: false,
  }));
}

beforeEach(async () => {
  resetStore();
  __resetSymbolsCacheForTests();
  __resetUserAssetsLoadForTests();
  __resetUserAssetStoreForTests();
  await idbClear();
  if (typeof URL.createObjectURL !== "function") {
    let n = 0;
    (URL as unknown as { createObjectURL: (blob: Blob) => string })
      .createObjectURL = () => `blob:test-${++n}`;
    (URL as unknown as { revokeObjectURL: (url: string) => void })
      .revokeObjectURL = () => {};
  }
});

afterEach(async () => {
  await idbClear();
});

describe("pasteImageFilesIntoCanvas", () => {
  it("sets the first pasted image as the backdrop when no backdrop exists", async () => {
    const id = useStore.getState().createPicmonic("premade");

    await pasteImageFilesIntoCanvas([pngFile("screenshot.png")]);

    const picmonic = useStore.getState().picmonics[id];
    expect(picmonic.canvas.backdrop.uploadedBlobId).toBeTruthy();
    expect(picmonic.canvas.symbols).toHaveLength(0);
    expect(picmonic.notes).toBe("");
    expect(useStore.getState().annotationMode).toBe(true);
  });

  it("keeps pasting as a symbol once a backdrop already exists", async () => {
    const id = useStore.getState().createPicmonic("premade");
    await useStore.getState().setBackdropFromUpload(pngFile("background.png"));
    const backdropId = useStore.getState().picmonics[id].canvas.backdrop
      .uploadedBlobId;
    useStore.getState().setAnnotationMode(false);

    await pasteImageFilesIntoCanvas([pngFile("symbol.png")]);

    const picmonic = useStore.getState().picmonics[id];
    expect(picmonic.canvas.backdrop.uploadedBlobId).toBe(backdropId);
    expect(picmonic.canvas.symbols).toHaveLength(1);
    expect(picmonic.canvas.symbols[0]).toMatchObject({ kind: "image" });
    expect(picmonic.notes).toContain(`{sym:${picmonic.canvas.symbols[0].id}}`);
    expect(useStore.getState().annotationMode).toBe(false);
  });
});
