import { parseNotes } from "@/lib/notes/parse";
import { parseBullet } from "@/lib/notes/bullet";
import { getOrderedFacts } from "@/lib/notes/fact-order";

const HEADER = [
  "picmonic_name",
  "section",
  "fact_name",
  "symbol_descriptions",
  "image_path",
] as const;

export interface AnkiExportInput {
  picmonicName: string;
  notes: string;
  imagePath: string;
}

export function csvCell(v: string): string {
  if (v == null) return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildAnkiRows(input: AnkiExportInput): string[][] {
  const parsed = parseNotes(input.notes);
  const ordered = getOrderedFacts(parsed);
  const lineOf = (offset: number): number => {
    let line = 1;
    for (let i = 0; i < offset && i < input.notes.length; i++) {
      if (input.notes.charCodeAt(i) === 10) line += 1;
    }
    return line;
  };
  const lines = input.notes.split(/\r?\n/);

  const rows: string[][] = [];
  for (const fact of ordered) {
    const descriptions: string[] = [];
    const seen = new Set<number>();
    for (const ref of fact.symbolRefs) {
      const ln = ref.bulletLine || lineOf(ref.start);
      if (seen.has(ln)) continue;
      seen.add(ln);
      const text = lines[ln - 1] ?? "";
      const parts = parseBullet(text);
      const segs = [parts.description, parts.meaning, parts.encoding].filter(
        (x): x is string => Boolean(x && x.trim()),
      );
      const joined = segs.join(" → ");
      if (joined) descriptions.push(joined);
    }
    rows.push([
      input.picmonicName,
      fact.sectionName ?? "",
      fact.name,
      descriptions.join(" ¶ "),
      input.imagePath,
    ]);
  }
  return rows;
}

export function rowsToCsv(rows: string[][]): string {
  const out: string[] = [];
  out.push(HEADER.map(csvCell).join(","));
  for (const row of rows) {
    out.push(row.map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

export function buildAnkiCsv(input: AnkiExportInput): string {
  return rowsToCsv(buildAnkiRows(input));
}
