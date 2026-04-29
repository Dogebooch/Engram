import type { PicmonicSlice } from "./slices/picmonic-slice";
import type { SelectionSlice } from "./slices/selection-slice";
import type { UiSlice } from "./slices/ui-slice";

export type RootState = PicmonicSlice & UiSlice & SelectionSlice;
