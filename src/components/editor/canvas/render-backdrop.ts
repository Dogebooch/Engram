import Konva from "konva";
import { imageCache } from "@/lib/image-cache";
import type { Backdrop } from "@/lib/types/canvas";
import { getBlob } from "@/lib/user-assets";
import { coverFit } from "./backdrop-fit";

/**
 * Add the backdrop image to a bare Konva.Layer for off-screen rasterization
 * (home-view thumbnail builder). No-op when the backdrop has no blob.
 *
 * The caller owns the layer and the URL — callers should track and revoke
 * the returned object URL after exporting. Callers that destroy the parent
 * stage immediately can ignore it (URLs hold a reference to the blob, which
 * is GC'd by the browser when nothing else points at it).
 */
export async function addBackdropToLayer(
  layer: Konva.Layer,
  backdrop: Backdrop | null | undefined,
): Promise<string | null> {
  const blobId = backdrop?.uploadedBlobId;
  if (!backdrop || !blobId) return null;
  const blob = await getBlob(blobId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const image = await imageCache.get(url);
    const fit = coverFit(image.naturalWidth, image.naturalHeight);
    layer.add(
      new Konva.Image({
        image,
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
        opacity: backdrop.opacity,
        perfectDrawEnabled: false,
      }),
    );
    return url;
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
