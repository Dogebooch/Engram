export interface UserAsset {
  id: string;
  displayName: string;
  tags: string[];
  originalFilename: string;
  mimeType: string;
  ext: string;
  size: number;
  sha256: string;
  createdAt: number;
  /**
   * Set when a background-removal pass has been applied. The original blob is
   * stashed in IDB under this id so the user can restore it. Absent on assets
   * that have never been processed.
   */
  originalBackupId?: string;
}

export interface UserAssetIndex {
  version: 1;
  assets: UserAsset[];
}

export function emptyUserAssetIndex(): UserAssetIndex {
  return { version: 1, assets: [] };
}
