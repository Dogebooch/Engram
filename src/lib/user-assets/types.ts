export type UserAssetKind = "symbol" | "background";

export interface UserAsset {
  id: string;
  kind: UserAssetKind;
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
  version: 2;
  assets: UserAsset[];
}

export function emptyUserAssetIndex(): UserAssetIndex {
  return { version: 2, assets: [] };
}
