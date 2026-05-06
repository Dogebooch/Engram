"use client";

import * as React from "react";
import { getBlob } from "./blob-store";

/**
 * Resolve a user-asset blob id into a stable object URL for preview <img>
 * tags. Revokes the previous URL when the id changes or the component
 * unmounts. Returns null while the blob is loading or if it's missing.
 */
export function useBlobPreviewUrl(blobId: string | null): string | null {
  const [entry, setEntry] = React.useState<{
    blobId: string;
    url: string;
  } | null>(null);

  React.useEffect(() => {
    if (!blobId) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    void getBlob(blobId).then((blob) => {
      if (cancelled || !blob) return;
      createdUrl = URL.createObjectURL(blob);
      setEntry({ blobId, url: createdUrl });
    });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [blobId]);

  // Stale entries are filtered out at read time rather than via setState
  // in the effect, which would trigger a cascade re-render.
  if (!blobId || !entry || entry.blobId !== blobId) return null;
  return entry.url;
}
