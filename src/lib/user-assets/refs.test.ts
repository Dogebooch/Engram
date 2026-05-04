import { describe, expect, it } from "vitest";
import {
  assetIdFromSymbolRef,
  deriveDisplayName,
  deriveTags,
  extForMime,
  isUserSymbolRef,
  userAssetSymbolId,
} from "./refs";

describe("user-asset refs", () => {
  it("round-trips id ↔ symbol ref", () => {
    const id = "abc-123";
    const ref = userAssetSymbolId(id);
    expect(ref).toBe("user:abc-123");
    expect(isUserSymbolRef(ref)).toBe(true);
    expect(isUserSymbolRef("openmoji:1F600")).toBe(false);
    expect(assetIdFromSymbolRef(ref)).toBe(id);
    expect(assetIdFromSymbolRef("openmoji:1F600")).toBeNull();
  });

  it("maps mime → ext", () => {
    expect(extForMime("image/png")).toBe("png");
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("image/svg+xml")).toBe("svg");
    expect(extForMime("application/x-bogus")).toBe("bin");
  });

  it("derives display name + tags from filename", () => {
    expect(deriveDisplayName("happy_cat.png")).toBe("happy cat");
    expect(deriveDisplayName("/tmp/Photos/Icon-A.svg")).toBe("Icon A");
    expect(deriveDisplayName("noext")).toBe("noext");
    expect(deriveTags("happy_cat.png")).toEqual(["happy", "cat"]);
  });
});
