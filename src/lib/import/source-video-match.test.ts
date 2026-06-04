import { describe, expect, it } from "vitest";
import type { PicmonicIndexEntry } from "@/lib/types/index-entry";
import type { MedicineVideo } from "@/lib/types/source-video";
import {
  deriveBundleSourceVideo,
  findExistingImportedSource,
  normalizeVideoTitle,
} from "./source-video-match";

const videos: MedicineVideo[] = [
  {
    id: 5,
    source: "Picmonic",
    course: "Picmonic",
    title: "2nd Generation Cephalosporin",
    path: "P:\\Medicine Videos\\Picmonic\\Picmonic\\2nd Generation Cephalosporin.mov",
    durationSeconds: 120,
    mtime: 1,
  },
  {
    id: 99,
    source: "Pixorize",
    course: "Biochemistry",
    title: "1280x720 Thiamine Mnemonic for USMLE",
    path: "P:\\Medicine Videos\\Pixorize\\Biochemistry\\1280x720 Thiamine Mnemonic for USMLE.mp4",
    durationSeconds: 100,
    mtime: 2,
  },
  {
    id: 100,
    source: "Pixorize",
    course: "Biochemistry",
    title: "1280x720 Thiamine Mnemonic for USMLE",
    path: "P:\\Medicine Videos\\Pixorize\\Duplicate\\1280x720 Thiamine Mnemonic for USMLE.mp4",
    durationSeconds: 90,
    mtime: 3,
  },
];

describe("source video matching", () => {
  it("normalizes common Medicine Videos title noise", () => {
    expect(normalizeVideoTitle("1280x720 Thiamine Mnemonic for USMLE.mp4")).toBe(
      "thiamine",
    );
  });

  it("matches exact MVS ids", () => {
    const match = deriveBundleSourceVideo(
      { provider: "mvs", id: 5, title: "2nd Generation Cephalosporin" },
      "fallback",
      videos,
    );
    expect(match).toMatchObject({
      confidence: "matched",
      id: 5,
      title: "2nd Generation Cephalosporin",
    });
  });

  it("uses unique normalized title fallback for old bundles", () => {
    const match = deriveBundleSourceVideo(null, "2nd Generation Cephalosporin", videos);
    expect(match).toMatchObject({
      confidence: "matched",
      id: 5,
    });
  });

  it("matches exact paths when bundle ids are missing", () => {
    const match = deriveBundleSourceVideo(
      {
        provider: "mvs",
        title: "renamed",
        path: "p:/medicine videos/pixorize/biochemistry/1280x720 thiamine mnemonic for usmle.mp4",
      },
      "fallback",
      videos,
    );
    expect(match).toMatchObject({
      confidence: "matched",
      id: 99,
    });
  });

  it("marks duplicate title fallback as probable", () => {
    const match = deriveBundleSourceVideo(null, "Thiamine", videos);
    expect(match).toMatchObject({
      confidence: "probable",
      title: "Thiamine",
    });
  });

  it("marks old unmatched bundles as unmatched", () => {
    const match = deriveBundleSourceVideo(null, "Unknown Video", videos);
    expect(match).toMatchObject({
      confidence: "unmatched",
      title: "Unknown Video",
    });
  });

  it("detects duplicate matched imports", () => {
    const sourceVideo = deriveBundleSourceVideo(
      { provider: "mvs", id: 5, title: "2nd Generation Cephalosporin" },
      "fallback",
      videos,
    );
    const index: PicmonicIndexEntry[] = [
      {
        id: "p1",
        name: "Existing",
        tags: [],
        folderId: null,
        sourceVideo,
        createdAt: 1,
        updatedAt: 1,
        thumbDataUrl: null,
        symbolCount: 0,
        factCount: 0,
      },
    ];
    expect(findExistingImportedSource(index, sourceVideo)?.id).toBe("p1");
  });
});
