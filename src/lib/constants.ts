export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
export const STAGE_ASPECT = STAGE_WIDTH / STAGE_HEIGHT;

export const GRID_SPACING = 64;
export const GRID_DOT_RADIUS = 1.25;

export const SAVE_DEBOUNCE_MS = 500;

export const IDB_KEYS = {
  uiPrefs: "engram:ui-prefs:v2",
  picmonicPrefix: "engram:picmonic:",
  picmonicIndex: "engram:picmonic-index:v1",
  userAssetsIndex: "engram:user-assets-index:v1",
} as const;

export function picmonicKey(id: string): string {
  return `${IDB_KEYS.picmonicPrefix}${id}`;
}

export const CANVAS_SCHEMA_VERSION = 1 as const;
export const BUNDLE_SCHEMA_VERSION = 2 as const;
export const SUPPORTED_BUNDLE_SCHEMA_VERSIONS = [1, 2] as const;

export const USER_ASSETS_DB = "engram-user-assets";
export const USER_ASSETS_STORE = "blobs";
export const USER_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const USER_ASSET_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";
export const USER_ASSET_ALLOWED_MIMES: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
];
export const USER_SYMBOL_PREFIX = "user:";

export const PANEL_DEFAULTS = {
  leftSize: 18,
  rightSize: 24,
  centerMin: 30,
  leftMin: 14,
  leftMax: 32,
  rightMin: 18,
  rightMax: 40,
} as const;

export const SYMBOL_DEFAULT_SIZE = 220;
export const SYMBOL_DUPLICATE_OFFSET = 24;
export const RECENT_SYMBOLS_MAX = 16;
export const SYMBOL_DRAG_MIME = "application/x-engram-symbol";
