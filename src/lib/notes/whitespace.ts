/**
 * Shared trim-trailing-whitespace helper for the notes lib.
 *
 * Walks backward from the end of `s` while the previous char is whitespace,
 * stopping at `stopAt` (default 0). Returns the resulting cut position —
 * `s.slice(0, trimTrailingWs(s))` is the trimmed string.
 */
export function trimTrailingWs(s: string, stopAt = 0): number {
  let pos = s.length;
  while (pos > stopAt && /\s/.test(s[pos - 1])) pos--;
  return pos;
}
