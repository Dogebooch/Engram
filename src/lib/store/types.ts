import type { CanvasSlice } from "./slices/canvas-slice";
import type { InteractionsSlice } from "./slices/interactions-slice";
import type { PicmonicSlice } from "./slices/picmonic-slice";
import type { PlayerSlice } from "./slices/player-slice";
import type { SelectionSlice } from "./slices/selection-slice";
import type { UiSlice } from "./slices/ui-slice";

export type RootState = PicmonicSlice &
  UiSlice &
  SelectionSlice &
  CanvasSlice &
  InteractionsSlice &
  PlayerSlice;
