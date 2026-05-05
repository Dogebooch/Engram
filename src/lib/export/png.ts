import Konva from "konva";
import { addBackdropToLayer } from "@/components/editor/canvas/render-backdrop";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import { imageCache } from "@/lib/image-cache";
import { getSymbolById, loadSymbols } from "@/lib/symbols";
import type { Picmonic } from "@/lib/types/picmonic";

export interface PngExportOptions {
  pixelRatio?: number;
  /**
   * When true (default), nodes tagged `name="export-chrome"` are hidden
   * before rasterization — dot grid, selection transformer, group-member
   * outlines. The PNG captures only the composition (paper + symbols),
   * which is what users want for sharing or printing.
   */
  hideChrome?: boolean;
}

export async function exportStageToPng(
  stage: Konva.Stage,
  opts: PngExportOptions = {},
): Promise<Blob> {
  const pixelRatio = opts.pixelRatio ?? 2;
  const hideChrome = opts.hideChrome ?? true;

  const hidden: Konva.Node[] = [];
  if (hideChrome) {
    for (const node of stage.find(".export-chrome")) {
      if (node.visible()) {
        node.visible(false);
        hidden.push(node);
      }
    }
    if (hidden.length > 0) stage.draw();
  }

  try {
    const dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
    const res = await fetch(dataUrl);
    return await res.blob();
  } finally {
    if (hidden.length > 0) {
      for (const node of hidden) node.visible(true);
      stage.draw();
    }
  }
}

const DEFAULT_PAPER_FILL = "oklch(0.105 0 0)";

function resolvePaperFill(): string {
  if (typeof window === "undefined") return DEFAULT_PAPER_FILL;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--stage")
    .trim();
  return v || DEFAULT_PAPER_FILL;
}

/**
 * Off-screen variant for the home view, where there is no live Konva stage.
 * Builds a transient stage in a hidden container, draws the paper rect +
 * symbols, exports, then disposes everything.
 *
 * Symbol images are loaded through the shared `imageCache`, so subsequent
 * renders of the same symbols are instant. The off-screen container is
 * positioned far off-screen rather than using `display:none` because
 * Konva needs a real, sized DOM element to attach to.
 */
export async function rasterizePicmonicToPng(
  picmonic: Picmonic,
  opts: { pixelRatio?: number } = {},
): Promise<Blob> {
  const pixelRatio = opts.pixelRatio ?? 2;
  await loadSymbols();

  const container = document.createElement("div");
  container.style.cssText =
    `position:fixed;left:-99999px;top:-99999px;` +
    `width:${STAGE_WIDTH}px;height:${STAGE_HEIGHT}px;pointer-events:none;`;
  document.body.appendChild(container);

  const stage = new Konva.Stage({
    container,
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
  });

  let backdropUrl: string | null = null;
  try {
    const bgLayer = new Konva.Layer({ listening: false });
    bgLayer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        fill: resolvePaperFill(),
      }),
    );
    stage.add(bgLayer);

    const backdropLayer = new Konva.Layer({ listening: false });
    backdropUrl = await addBackdropToLayer(
      backdropLayer,
      picmonic.canvas.backdrop,
    );
    stage.add(backdropLayer);

    const symLayer = new Konva.Layer({ listening: false });
    for (const layer of picmonic.canvas.symbols) {
      const entry = getSymbolById(layer.ref);
      const url = entry?.imageUrl;
      if (!url) continue;
      try {
        const image = await imageCache.get(url);
        symLayer.add(
          new Konva.Image({
            image,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            rotation: layer.rotation,
            perfectDrawEnabled: false,
          }),
        );
      } catch {
        // Skip a single broken symbol rather than failing the whole export.
        continue;
      }
    }
    stage.add(symLayer);
    stage.draw();

    const dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
    const res = await fetch(dataUrl);
    return await res.blob();
  } finally {
    stage.destroy();
    container.remove();
    if (backdropUrl) URL.revokeObjectURL(backdropUrl);
  }
}
