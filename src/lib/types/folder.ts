export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type FolderIndex = FolderNode[];

export const UNFILED_FOLDER_ID = "__unfiled__";
