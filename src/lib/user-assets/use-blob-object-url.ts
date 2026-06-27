import * as React from "react";
import { getBlob } from "./blob-store";

/**
 * Resolve an IDB blob id into an object URL, revoking on swap/unmount.
 * Returns null while loading or when there's no blob id.
 */
export function useBlobObjectUrl(blobId: string | null): string | null {
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

  // Stale entry: id changed since last resolution. Treat as null until the
  // new effect resolves; the old object URL is revoked by the previous
  // effect's cleanup.
  if (!entry || entry.blobId !== blobId) return null;
  return entry.url;
}
