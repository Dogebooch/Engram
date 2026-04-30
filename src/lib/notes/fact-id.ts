export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "untitled";
}

export function synthesizeFactId(
  sectionName: string | null,
  factName: string,
  occurrenceIndex: number,
): string {
  const sec = sectionName ? slugify(sectionName) : "_";
  const fact = slugify(factName);
  return `${sec}::${fact}#${occurrenceIndex}`;
}

export function synthesizeSectionId(
  sectionName: string,
  occurrenceIndex: number,
): string {
  return `sec:${slugify(sectionName)}#${occurrenceIndex}`;
}
