"use client";

import { Image as KonvaImage, Layer } from "react-konva";
import { useImage } from "@/lib/image-cache";
import { useBlobObjectUrl } from "@/lib/user-assets/use-blob-object-url";
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
