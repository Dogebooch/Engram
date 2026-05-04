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
}

export interface UserAssetIndex {
  version: 1;
  assets: UserAsset[];
}

export function emptyUserAssetIndex(): UserAssetIndex {
  return { version: 1, assets: [] };
}
