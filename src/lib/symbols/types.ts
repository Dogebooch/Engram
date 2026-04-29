export type SymbolSource = "openmoji" | "user";

export interface SymbolEntry {
  id: string;
  displayName: string;
  aliases: string[];
  tags: string[];
  source: SymbolSource;
  qualityRank: number;
  imageUrl: string;
}
