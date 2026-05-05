"use client";

import * as React from "react";
import { Image as KonvaImage, Layer } from "react-konva";
import { useImage } from "@/lib/image-cache";
import { getBlob } from "@/lib/user-assets";
import type { Backdrop } from "@/lib/types/canvas";
import { coverFit } from "./backdrop-fit";

interface BackdropLayerProps {
  backdrop: Backdrop;
}

/**
 * Renders the active Picmonic's backdrop image inside its own Konva Layer.
 * `listening={false}` so the backdrop is never selectable, draggable, or
 * marquee-hit. The blob is fetched from the user-asset blob store and
 * exposed as an object URL for the duration of the component's mount or
 * until `uploadedBlobId` changes.
 */
export function BackdropLayer({ backdrop }: BackdropLayerProps) {
  const url = useBlobObjectUrl(backdrop.uploadedBlobId);
  const state = useImage(url);

  if (!url) return <Layer listening={false} />;
  if (state.status !== "ready") return <Layer listening={false} />;

  const fit = coverFit(state.image.naturalWidth, state.image.naturalHeight);

  return (
    <Layer listening={false}>
      <KonvaImage
        image={state.image}
        x={fit.x}
        y={fit.y}
        width={fit.width}
        height={fit.height}
        opacity={backdrop.opacity}
        perfectDrawEnabled={false}
      />
    </Layer>
  );
}

/**
 * Resolve an IDB blob id into an object URL, revoking on swap/unmount.
 * Returns null while loading or when there's no blob id.
 */
function useBlobObjectUrl(blobId: string | null): string | null {
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
