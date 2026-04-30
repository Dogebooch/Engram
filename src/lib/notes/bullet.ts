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
