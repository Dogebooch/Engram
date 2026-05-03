export interface BulletParts {
  /** Text after the symbol token, before the first `→` (or full body if no arrow). */
  description: string;
  /** Text after the first `→`, before the first `;`. Null if no arrow. */
  meaning: string | null;
  /** Text after the first `;` that follows the first `→`. Null if no semicolon. */
  encoding: string | null;
  /** The body string that was parsed (post-bullet-marker, post-symbol-token). */
  raw: string;
}

const SYM_TOKEN_PREFIX_RE =
  /^\s*(?:[*\-+]\s+)?(?:\{sym:[0-9a-fA-F-]+\}\s*)?/;

/**
 * Parse a single notes bullet line into its three semantic parts.
 *
 * Format: `* {sym:UUID} Visual description → meaning; encoding-note`
 *
 *   - `→` (or `->`) is the canonical separator. The first one wins.
 *   - `;` after the arrow splits meaning vs encoding. The first one wins.
 *   - Missing arrow → entire body is `description`; meaning + encoding null.
 *   - Missing semicolon → meaning captures everything after the arrow; encoding null.
 *   - Bullet markers (`*`, `-`, `+`) and the leading sym-token are stripped.
 */
export function parseBullet(line: string): BulletParts {
  const stripped = line.replace(SYM_TOKEN_PREFIX_RE, "");
  const raw = stripped.trim();

  const arrowIdx = firstArrow(raw);
  if (arrowIdx === -1) {
    return { description: raw, meaning: null, encoding: null, raw };
  }

  const description = raw.slice(0, arrowIdx).trim();
  // skip the arrow itself: → is one char, -> is two
  const arrowLen = raw[arrowIdx] === "→" ? 1 : 2;
  const after = raw.slice(arrowIdx + arrowLen);

  const semiIdx = after.indexOf(";");
  if (semiIdx === -1) {
    const meaning = after.trim();
    return {
      description,
      meaning: meaning || null,
      encoding: null,
      raw,
    };
  }

  const meaning = after.slice(0, semiIdx).trim();
  const encoding = after.slice(semiIdx + 1).trim();
  return {
    description,
    meaning: meaning || null,
    encoding: encoding || null,
    raw,
  };
}

function firstArrow(s: string): number {
  const uni = s.indexOf("→"); // →
  const ascii = s.indexOf("->");
  if (uni === -1) return ascii;
  if (ascii === -1) return uni;
  return Math.min(uni, ascii);
}

export interface BulletBodyParts {
  description: string;
  meaning: string | null;
  encoding: string | null;
}

/**
 * Emit the bullet body text (the part after `{sym:UUID} `) for a set of parts.
 * Caller owns whitespace inside each field — we don't trim, so the form's
 * controlled-input round-trip preserves what the user typed.
 *
 * Shapes:
 *   description only          → `desc`
 *   description + meaning     → `desc → meaning`
 *   description + encoding    → `desc → ; encoding`   (unusual but legal)
 *   all three                 → `desc → meaning; encoding`
 */
export function formatBulletBody(parts: BulletBodyParts): string {
  const d = parts.description;
  const m = parts.meaning ?? "";
  const e = parts.encoding ?? "";
  if (!m && !e) return d;
  if (!e) return `${d} → ${m}`;
  if (!m) return `${d} → ; ${e}`;
  return `${d} → ${m}; ${e}`;
}

const SYM_TOKEN_GLOBAL_RE =
  /\{sym:[0-9a-fA-F-]+\}/g;

interface BodyRange {
  /** Index of the char immediately after the active symbol's `{sym:UUID}` token. */
  bodyStart: number;
  /** Exclusive end of the editable body slice (next sym-token, end-of-line, or
   *  end of any continuation block). */
  bodyEnd: number;
  /** Same as bodyStart minus any leading whitespace immediately after the token. */
  preserveSpaceCount: number;
}

function isLineContinuation(notes: string, lineStart: number): boolean {
  // A markdown list-item continuation line begins with whitespace and is non-empty.
  if (lineStart >= notes.length) return false;
  const ch = notes.charCodeAt(lineStart);
  if (ch === 10 /* \n */) return false;
  return ch === 32 /* space */ || ch === 9 /* tab */;
}

/**
 * Compute the editable byte range for the active symbol's bullet body, given
 * the symbol token's [start, end) within `notes`. Caps at the next `{sym:` on
 * the same line, then walks any indented continuation lines (rare; the linter
 * discourages them) so they get folded into the rebuilt single-line body.
 */
function computeBodyRange(notes: string, tokenStart: number, tokenEnd: number): BodyRange {
  // Find end-of-line.
  let eol = notes.indexOf("\n", tokenEnd);
  if (eol === -1) eol = notes.length;

  // Cap at the next `{sym:` token on this same line, if any.
  SYM_TOKEN_GLOBAL_RE.lastIndex = tokenEnd;
  const next = SYM_TOKEN_GLOBAL_RE.exec(notes);
  let bodyEnd = eol;
  if (next && next.index < eol) {
    bodyEnd = next.index;
  }

  // Walk continuation lines (only when our bodyEnd lands at the EOL — not when
  // we capped at a sibling sym-token earlier on the line).
  if (bodyEnd === eol) {
    let cursor = eol;
    while (cursor < notes.length && notes.charCodeAt(cursor) === 10) {
      const lineStart = cursor + 1;
      if (!isLineContinuation(notes, lineStart)) break;
      const nextEol = notes.indexOf("\n", lineStart);
      cursor = nextEol === -1 ? notes.length : nextEol;
    }
    bodyEnd = cursor;
  }

  // Count leading whitespace inside [tokenEnd, bodyEnd) — preserve exactly one
  // space delimiter; strip the rest. (User-visible: the form rebuilds from
  // parts, so we don't carry forward stray whitespace.)
  let ws = 0;
  while (
    tokenEnd + ws < bodyEnd &&
    (notes.charCodeAt(tokenEnd + ws) === 32 || notes.charCodeAt(tokenEnd + ws) === 9)
  ) {
    ws++;
  }
  return { bodyStart: tokenEnd, bodyEnd, preserveSpaceCount: ws };
}

export interface UpdateBulletPartsResult {
  newNotes: string;
  ok: boolean;
}

/**
 * Rewrite a single bullet's body — the slice after `{sym:UUID}` — without
 * touching the bullet marker, the symbol token, or any other line in `notes`.
 *
 * Robust to:
 *   - multiple `{sym:}` tokens on one line (capped at the next token's start)
 *   - markdown list-item continuation lines (folded back into the single-line body)
 *   - unicode `→` and ASCII `->` arrows (caller's `parts` decides shape via formatBulletBody)
 *
 * Returns `{ ok: false, newNotes: notes }` if the symbol+fact pair has no
 * matching ParsedSymbolRef. Pure: does not mutate `parsed`.
 */
export function updateBulletParts(
  notes: string,
  parsed: { factsById: Map<string, { symbolRefs: ReadonlyArray<{ symbolId: string; start: number; end: number }> }> },
  factId: string,
  symbolId: string,
  parts: BulletBodyParts,
): UpdateBulletPartsResult {
  const fact = parsed.factsById.get(factId);
  if (!fact) return { newNotes: notes, ok: false };
  const ref = fact.symbolRefs.find((r) => r.symbolId === symbolId);
  if (!ref) return { newNotes: notes, ok: false };

  const range = computeBodyRange(notes, ref.start, ref.end);
  const body = formatBulletBody(parts);
  // Always emit a single space between the token and the body, except when the
  // body is empty (then no trailing whitespace at all on the line).
  const replacement = body.length === 0 ? "" : ` ${body}`;

  const before = notes.slice(0, range.bodyStart);
  const after = notes.slice(range.bodyEnd);
  return { newNotes: before + replacement + after, ok: true };
}
