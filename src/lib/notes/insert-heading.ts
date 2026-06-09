export interface InsertHeadingResult {
  newNotes: string;
  /** Caret offset just after the inserted `# `/`## ` prefix (start of the name). */
  anchor: number;
  /** Document offset where the inserted heading's first `#` lands. */
  headingFrom: number;
}

/**
 * Insert a `# `/`## ` heading at `atOffset`, on its own line. Pure string
 * surgery shared by the CodeMirror "+ fact/+ section" widgets (empty name,
 * caret-driven) and the Form view's add buttons (named, so the heading parses
 * into a renderable Fact/Section immediately).
 *
 * Mirrors the original line-start logic: when `atOffset` already sits at a line
 * start we append a trailing newline; otherwise we prepend one and rely on the
 * existing following newline.
 */
export function insertHeadingText(
  notes: string,
  atOffset: number,
  level: 1 | 2,
  name = "",
): InsertHeadingResult {
  const prefix = level === 1 ? "# " : "## ";
  const atLineStart = atOffset === 0 || notes[atOffset - 1] === "\n";
  const insert = atLineStart ? `${prefix}${name}\n` : `\n${prefix}${name}`;
  const headingFrom = atOffset + (atLineStart ? 0 : 1);
  const anchor = headingFrom + prefix.length;
  const newNotes = notes.slice(0, atOffset) + insert + notes.slice(atOffset);
  return { newNotes, anchor, headingFrom };
}
