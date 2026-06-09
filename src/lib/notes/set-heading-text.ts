export interface SetHeadingTextResult {
  newNotes: string;
  ok: boolean;
}

/**
 * Rewrite a heading's name in place, preserving its `# `/`## ` marker. The
 * heading node spans `[headingFrom, headingTo)` (marker + text). A blank name
 * would stop the heading from parsing into a Fact/Section, so we reject it
 * (`ok: false`) and let the caller revert to the prior name.
 *
 * Rename is cosmetic: bullets live under the heading and move with it; symbol
 * references are UUIDs in bullet text, so no stored reference breaks.
 */
export function setHeadingText(
  notes: string,
  headingFrom: number,
  headingTo: number,
  level: 1 | 2,
  name: string,
): SetHeadingTextResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { newNotes: notes, ok: false };
  const prefix = level === 1 ? "# " : "## ";
  const replacement = `${prefix}${trimmed}`;
  return {
    newNotes: notes.slice(0, headingFrom) + replacement + notes.slice(headingTo),
    ok: true,
  };
}
