import { parseBullet } from "./bullet";
import type { ParsedNotes } from "./types";

export type LintSeverity = "error" | "warning";

export type LintCode =
  | "missing-symbol-token"
  | "malformed-symbol-token"
  | "empty-description"
  | "unknown-symbol-uuid"
  | "missing-arrow"
  | "missing-semicolon"
  | "untagged-symbol";

export interface LintIssue {
  code: LintCode;
  severity: LintSeverity;
  message: string;
  from: number;
  to: number;
}

export interface LintBulletCtx {
  knownSymbolIds?: ReadonlySet<string>;
  lineOffset?: number;
}

const BULLET_PREFIX_RE = /^(\s*)([*\-+])(\s+)/;
const SYM_TOKEN_RE = /\{sym:([^}]*)\}/;
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function severityFor(code: LintCode): LintSeverity {
  switch (code) {
    case "missing-symbol-token":
    case "malformed-symbol-token":
    case "empty-description":
      return "error";
    default:
      return "warning";
  }
}

function messageFor(code: LintCode): string {
  switch (code) {
    case "missing-symbol-token":
      return "Bullet under a Fact must contain a {sym:UUID} token.";
    case "malformed-symbol-token":
      return "Symbol token UUID is not a valid v4 form.";
    case "empty-description":
      return "Description is empty — add visual text before the `→`. Format: `{sym:UUID} Visual description → meaning; encoding`.";
    case "unknown-symbol-uuid":
      return "Symbol UUID does not match any canvas symbol.";
    case "missing-arrow":
      return "Bullet has no `→` (or `->`); meaning is empty.";
    case "missing-semicolon":
      return "Bullet has no `;` after the arrow; encoding-note is empty.";
    case "untagged-symbol":
      return "Canvas symbol has no bullet under any Fact.";
  }
}

function makeIssue(
  code: LintCode,
  fromInLine: number,
  toInLine: number,
  ctx?: LintBulletCtx,
): LintIssue {
  const base = ctx?.lineOffset ?? 0;
  return {
    code,
    severity: severityFor(code),
    message: messageFor(code),
    from: base + fromInLine,
    to: base + toInLine,
  };
}

/**
 * Pure per-bullet-line linter.
 *
 * Returns issues for a single line that is expected to be a bullet under a
 * Fact body. Caller is responsible for confining this to bullet lines inside
 * Fact `bodyRange`s — `lintNotes` does that.
 *
 * Offsets are document-absolute when `ctx.lineOffset` is provided, otherwise
 * line-relative.
 */
export function lintBullet(line: string, ctx?: LintBulletCtx): LintIssue[] {
  const issues: LintIssue[] = [];
  const lineEnd = line.length;

  const tokenMatch = SYM_TOKEN_RE.exec(line);

  if (!tokenMatch) {
    issues.push(makeIssue("missing-symbol-token", 0, lineEnd, ctx));
  } else {
    const tokenStart = tokenMatch.index;
    const tokenEnd = tokenStart + tokenMatch[0].length;
    const uuid = tokenMatch[1];
    if (!UUID_V4_RE.test(uuid)) {
      issues.push(makeIssue("malformed-symbol-token", tokenStart, tokenEnd, ctx));
    } else if (ctx?.knownSymbolIds && !ctx.knownSymbolIds.has(uuid.toLowerCase())) {
      issues.push(makeIssue("unknown-symbol-uuid", tokenStart, tokenEnd, ctx));
    }
  }

  const parts = parseBullet(line);

  if (parts.description.length === 0) {
    issues.push(makeIssue("empty-description", 0, lineEnd, ctx));
  }

  // Only emit format warnings when a (well-formed enough) symbol token exists —
  // otherwise `missing-symbol-token` already covers the line.
  if (tokenMatch) {
    if (parts.meaning === null) {
      issues.push(makeIssue("missing-arrow", 0, lineEnd, ctx));
    } else if (parts.encoding === null) {
      issues.push(makeIssue("missing-semicolon", 0, lineEnd, ctx));
    }
  }

  return issues;
}

/**
 * Document-wide pass. Walks each Fact's bodyRange, lints every bullet line,
 * and adds `untagged-symbol` for every canvas symbol id with no bullet.
 */
export function lintNotes(
  notes: string,
  parsed: ParsedNotes,
  knownSymbolIds: ReadonlySet<string>,
): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const fact of parsed.factsById.values()) {
    const { from, to } = fact.bodyRange;
    if (to <= from) continue;
    const body = notes.slice(from, to);

    let cursor = 0;
    while (cursor < body.length) {
      const nl = body.indexOf("\n", cursor);
      const lineStart = cursor;
      const lineEnd = nl === -1 ? body.length : nl;
      const line = body.slice(lineStart, lineEnd);
      cursor = lineEnd + 1;

      if (!BULLET_PREFIX_RE.test(line)) continue;

      const lineOffset = from + lineStart;
      issues.push(...lintBullet(line, { knownSymbolIds, lineOffset }));
    }
  }

  const tagged = parsed.factsBySymbolId;
  for (const id of knownSymbolIds) {
    if (!tagged.has(id)) {
      issues.push({
        code: "untagged-symbol",
        severity: severityFor("untagged-symbol"),
        message: `${messageFor("untagged-symbol")} (${id})`,
        from: parsed.docLength,
        to: parsed.docLength,
      });
    }
  }

  return issues;
}
