import { afterEach, describe, expect, it } from "vitest";
import { clear as idbClear } from "idb-keyval";
import { buildBundleZip } from "@/lib/export/bundle";
import { emptyCanvas } from "@/lib/types/canvas";
import type { PicmonicIndexEntry } from "@/lib/types/index-entry";
import type { Picmonic } from "@/lib/types/picmonic";
import type { MedicineVideo } from "@/lib/types/source-video";
import { importBundleFilesSequentially } from "./use-bundle-import";

const UUID_A = "11111111-1111-4111-8111-111111111111";

const medicineVideos: MedicineVideo[] = [
  {
    id: 5,
    source: "Picmonic",
    course: "Picmonic",
    title: "2nd Generation Cephalosporin",
    path: "P:\\Medicine Videos\\Picmonic\\Picmonic\\2nd Generation Cephalosporin.mov",
    durationSeconds: 120,
    mtime: 1,
  },
];

function makeBundleSource(): Picmonic {
  return {
    id: "bundle-source",
    meta: {
      name: "2nd Generation Cephalosporin",
      tags: [],
      folderId: null,
      sourceVideo: {
        provider: "mvs",
        id: 5,
        title: "2nd Generation Cephalosporin",
        path: "P:\\Medicine Videos\\Picmonic\\Picmonic\\2nd Generation Cephalosporin.mov",
        source: "Picmonic",
        course: "Picmonic",
        importedAt: 1,
        confidence: "matched",
      },
      createdAt: 1,
      updatedAt: 1,
    },
    notes: `# Section\n## Fact\n* {sym:${UUID_A}} desc -> meaning; evidence\n`,
    canvas: {
      ...emptyCanvas(),
      symbols: [
        {
          id: UUID_A,
          kind: "image",
          ref: "openmoji:1F600",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          layerIndex: 0,
          groupId: null,
          animation: null,
          animationDelay: null,
          animationDuration: null,
        },
      ],
    },
  };
}

async function bundleFile(name: string): Promise<File> {
  const blob = await buildBundleZip({ picmonic: makeBundleSource(), pngBlob: null });
  return new File([await blob.arrayBuffer()], name, { type: "application/zip" });
}

afterEach(async () => {
  await idbClear();
});

describe("importBundleFilesSequentially", () => {
  it("keeps mixed batch result order and skips duplicate matched source videos", async () => {
    const hydrated: Picmonic[] = [];
    const upserted: PicmonicIndexEntry[] = [];

    const results = await importBundleFilesSequentially({
      files: [
        await bundleFile("first.engram.zip"),
        new File(["not a zip"], "notes.txt", { type: "text/plain" }),
        await bundleFile("duplicate.engram.zip"),
      ],
      folderId: "folder-a",
      medicineVideos,
      index: [],
      hydratePicmonic: (picmonic) => hydrated.push(picmonic),
      upsertIndexEntry: (entry) => upserted.push(entry),
    });

    expect(results.map((r) => r.status)).toEqual([
      "imported",
      "failed",
      "skipped",
    ]);
    expect(results[0]).toMatchObject({
      status: "imported",
      fileName: "first.engram.zip",
      name: "2nd Generation Cephalosporin",
    });
    expect(results[1]).toMatchObject({
      status: "failed",
      fileName: "notes.txt",
      reason: "Not a .zip file",
    });
    expect(results[2]).toMatchObject({
      status: "skipped",
      fileName: "duplicate.engram.zip",
    });
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].meta.folderId).toBe("folder-a");
    expect(hydrated[0].meta.sourceVideo).toMatchObject({
      confidence: "matched",
      id: 5,
    });
    expect(upserted).toHaveLength(1);
  });
});
