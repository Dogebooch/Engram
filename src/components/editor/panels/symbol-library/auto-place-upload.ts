import { STAGE_HEIGHT, STAGE_WIDTH, SYMBOL_DEFAULT_SIZE } from "@/lib/constants";
import { addSymbolWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import { useStore } from "@/lib/store";
import { userAssetSymbolId } from "@/lib/user-assets";
import type { UploadResult } from "@/lib/user-assets";

const CENTER_X = STAGE_WIDTH / 2 - SYMBOL_DEFAULT_SIZE / 2;
const CENTER_Y = STAGE_HEIGHT / 2 - SYMBOL_DEFAULT_SIZE / 2;

/**
 * Add a single uploaded asset to the canvas as a symbol (with its note bullet,
 * via the one atomic add path). Shared by the armed-fact auto-place below and
 * the drop-image-onto-canvas flow ([use-canvas-file-drop.ts]).
 */
export function placeUploadedAssetOnCanvas(
  assetId: string,
  opts: { x: number; y: number; targetFactId?: string | null },
): string | null {
  return addSymbolWithNoteSync({
    ref: userAssetSymbolId(assetId),
    x: opts.x,
    y: opts.y,
    targetFactId: opts.targetFactId,
  });
}

/**
 * If a fact is armed (via the notes "+ symbol" footer) and an upload resolves
 * to exactly one asset, drop that symbol straight into the armed fact so the
 * user doesn't have to click the freshly-uploaded thumbnail. Multiple files
 * stay ambiguous and just populate "My Uploads".
 */
export function autoPlaceUploadIntoArmedFact(result: UploadResult): void {
  const armed = useStore.getState().addSymbolTargetFactId;
  if (!armed) return;
  const assets = [...result.added, ...result.duplicates];
  if (assets.length !== 1) return;
  placeUploadedAssetOnCanvas(assets[0].id, {
    x: CENTER_X,
    y: CENTER_Y,
    targetFactId: armed,
  });
}
