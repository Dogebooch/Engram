import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { findFactAtOffset, parseNotes } from "../parse";

const SYM_TOKEN_RE =
  /\{sym:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}/gi;

export interface ResolvedSymbolChip {
  displayName: string;
  imageUrl: string | null;
  broken: boolean;
}

export type SymbolChipResolver = (uuid: string) => ResolvedSymbolChip;

const defaultResolver: SymbolChipResolver = () => ({
  displayName: "symbol",
  imageUrl: null,
  broken: false,
});

let activeResolver: SymbolChipResolver = defaultResolver;
let activeOnPointerDown:
  | ((
      uuid: string,
      factId: string | null,
      e: PointerEvent,
      resolved: ResolvedSymbolChip,
    ) => void)
  | null = null;
let activeOnDoubleClick:
  | ((uuid: string, factId: string | null, resolved: ResolvedSymbolChip) => void)
  | null = null;
let activeOnHoverChange: ((uuid: string | null) => void) | null = null;

export function setSymbolChipResolver(resolver: SymbolChipResolver): void {
  activeResolver = resolver;
}

/** Double-click a chip → open the structured Describe editor for that symbol. */
export function setSymbolChipOnDoubleClick(
  handler: (uuid: string, factId: string | null, resolved: ResolvedSymbolChip) => void,
): void {
  activeOnDoubleClick = handler;
}

/**
 * Press on a chip. A press that stays put resolves to a select; a press that
 * moves past the drag threshold becomes a move (see [symbol-row-drag.ts]).
 */
export function setSymbolChipOnPointerDown(
  handler: (
    uuid: string,
    factId: string | null,
    e: PointerEvent,
    resolved: ResolvedSymbolChip,
  ) => void,
): void {
  activeOnPointerDown = handler;
}

export function setSymbolChipOnHoverChange(
  handler: (uuid: string | null) => void,
): void {
  activeOnHoverChange = handler;
}

class SymbolChipWidget extends WidgetType {
  constructor(
    readonly uuid: string,
    readonly resolved: ResolvedSymbolChip,
    readonly cueLabel: string | null,
    readonly factId: string | null,
  ) {
    super();
  }

  override eq(other: SymbolChipWidget): boolean {
    return (
      other.uuid === this.uuid &&
      other.resolved.displayName === this.resolved.displayName &&
      other.resolved.imageUrl === this.resolved.imageUrl &&
      other.resolved.broken === this.resolved.broken &&
      other.cueLabel === this.cueLabel &&
      other.factId === this.factId
    );
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "eng-sym-chip";
    span.dataset.symId = this.uuid;
    span.setAttribute("role", "button");
    span.setAttribute("tabindex", "-1");

    const resolved = this.resolved;
    const cueLabel = this.cueLabel?.trim() ?? "";
    const hasCueLabel = cueLabel.length > 0;

    if (resolved.broken) {
      span.classList.add("eng-sym-chip-broken");
      const dot = document.createElement("span");
      dot.className = "eng-sym-chip__dot";
      span.appendChild(dot);
      const label = document.createElement("span");
      label.className = "eng-sym-chip__label";
      label.textContent = "missing";
      span.appendChild(label);
      span.title = `Symbol ${this.uuid.slice(0, 8)}… not on canvas`;
      span.setAttribute("aria-label", span.title);
    } else {
      if (hasCueLabel) {
        span.classList.add("eng-sym-chip-compact");
        span.title = `${cueLabel} (${resolved.displayName})`;
        span.setAttribute(
          "aria-label",
          `Select symbol: ${cueLabel} (${resolved.displayName})`,
        );
      } else {
        span.classList.add("eng-sym-chip-fallback");
        span.title = `${resolved.displayName} — add visual description`;
        span.setAttribute(
          "aria-label",
          `Select symbol: ${resolved.displayName}. Description missing.`,
        );
      }
      if (resolved.imageUrl) {
        const img = document.createElement("img");
        img.className = "eng-sym-chip__img";
        img.src = resolved.imageUrl;
        img.alt = "";
        img.draggable = false;
        img.loading = "lazy";
        span.appendChild(img);
      } else if (hasCueLabel) {
        const handle = document.createElement("span");
        handle.className = "eng-sym-chip__handle";
        span.appendChild(handle);
      }
      if (!hasCueLabel) {
        const label = document.createElement("span");
        label.className = "eng-sym-chip__label";
        label.textContent = resolved.displayName;
        span.appendChild(label);
      }
    }

    span.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      // Second click of a double-click routes to the Describe editor instead of
      // re-running select (which would re-prompt the outline confirm).
      if (e.detail >= 2 && activeOnDoubleClick) {
        activeOnDoubleClick(this.uuid, this.factId, this.resolved);
        return;
      }
      activeOnPointerDown?.(this.uuid, this.factId, e, this.resolved);
    });
    span.addEventListener("mouseenter", () => {
      activeOnHoverChange?.(this.uuid);
    });
    span.addEventListener("mouseleave", () => {
      activeOnHoverChange?.(null);
    });

    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class EmptyBulletGuideWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "eng-note-empty-guide";
    for (const label of ["description", "→", "meaning", ";", "why"]) {
      const part = document.createElement("span");
      part.textContent = label;
      span.appendChild(part);
    }
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

interface BulletRanges {
  isBullet: boolean;
  cueLabel: string | null;
  marker: { from: number; to: number } | null;
  description: { from: number; to: number } | null;
  arrow: { from: number; to: number } | null;
  meaning: { from: number; to: number } | null;
  semicolon: { from: number; to: number } | null;
  encoding: { from: number; to: number } | null;
  emptyDescription: boolean;
}

const BULLET_MARKER_RE = /^(\s*)([*\-+])(\s+)/;
const NEXT_SYM_TOKEN_RE =
  /\{sym:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}/gi;

function skipInlineWs(text: string, pos: number, end: number): number {
  let next = pos;
  while (next < end && (text.charCodeAt(next) === 32 || text.charCodeAt(next) === 9)) {
    next++;
  }
  return next;
}

function trimRangeEnd(text: string, from: number, to: number): number {
  let next = to;
  while (next > from && (text.charCodeAt(next - 1) === 32 || text.charCodeAt(next - 1) === 9)) {
    next--;
  }
  return next;
}

function firstArrow(text: string, from: number, to: number): { from: number; to: number } | null {
  const unicode = text.indexOf("→", from);
  const ascii = text.indexOf("->", from);
  const unicodeInRange = unicode !== -1 && unicode < to;
  const asciiInRange = ascii !== -1 && ascii < to;
  if (!unicodeInRange && !asciiInRange) return null;
  if (unicodeInRange && (!asciiInRange || unicode < ascii)) {
    return { from: unicode, to: unicode + 1 };
  }
  return { from: ascii, to: ascii + 2 };
}

function nextSymbolStart(lineText: string, from: number): number {
  NEXT_SYM_TOKEN_RE.lastIndex = from;
  const next = NEXT_SYM_TOKEN_RE.exec(lineText);
  return next ? next.index : lineText.length;
}

function rangeOrNull(from: number, to: number): { from: number; to: number } | null {
  return to > from ? { from, to } : null;
}

function parseBulletRanges(lineText: string, tokenEnd: number): BulletRanges {
  const markerMatch = BULLET_MARKER_RE.exec(lineText);
  const marker = markerMatch
    ? {
        from: markerMatch[1].length,
        to: markerMatch[1].length + markerMatch[2].length,
      }
    : null;

  const limit = nextSymbolStart(lineText, tokenEnd);
  const bodyStart = skipInlineWs(lineText, tokenEnd, limit);
  const bodyEnd = trimRangeEnd(lineText, bodyStart, limit);
  const arrow = firstArrow(lineText, bodyStart, bodyEnd);

  if (!arrow) {
    const description = rangeOrNull(bodyStart, bodyEnd);
    return {
      isBullet: true,
      cueLabel: description ? lineText.slice(description.from, description.to).trim() : null,
      marker,
      description,
      arrow: null,
      meaning: null,
      semicolon: null,
      encoding: null,
      emptyDescription: !description,
    };
  }

  const descriptionEnd = trimRangeEnd(lineText, bodyStart, arrow.from);
  const description = rangeOrNull(bodyStart, descriptionEnd);
  const afterArrowStart = skipInlineWs(lineText, arrow.to, bodyEnd);
  const semi = lineText.indexOf(";", afterArrowStart);
  const hasSemi = semi !== -1 && semi < bodyEnd;
  const meaningEnd = trimRangeEnd(lineText, afterArrowStart, hasSemi ? semi : bodyEnd);
  const meaning = rangeOrNull(afterArrowStart, meaningEnd);
  const semicolon = hasSemi ? { from: semi, to: semi + 1 } : null;
  const encodingStart = hasSemi ? skipInlineWs(lineText, semi + 1, bodyEnd) : bodyEnd;
  const encoding = hasSemi ? rangeOrNull(encodingStart, bodyEnd) : null;

  return {
    isBullet: true,
    cueLabel: description ? lineText.slice(description.from, description.to).trim() : null,
    marker,
    description,
    arrow,
    meaning,
    semicolon,
    encoding,
    emptyDescription: !description,
  };
}

function isInsideCode(view: EditorView, pos: number): boolean {
  const node = syntaxTree(view.state).resolveInner(pos, 1);
  for (let n: typeof node | null = node; n; n = n.parent) {
    const name = n.type.name;
    if (
      name === "FencedCode" ||
      name === "InlineCode" ||
      name === "CodeBlock" ||
      name === "CodeText"
    ) {
      return true;
    }
  }
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  const parsed = parseNotes(view.state.doc.toString());
  const factIdByLineAndSymbol = new Map<string, string>();
  for (const fact of parsed.factsById.values()) {
    for (const ref of fact.symbolRefs) {
      factIdByLineAndSymbol.set(`${ref.bulletLine}:${ref.symbolId}`, fact.factId);
    }
  }
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    SYM_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SYM_TOKEN_RE.exec(text))) {
      const matchFrom = from + m.index;
      const matchTo = matchFrom + m[0].length;
      if (isInsideCode(view, matchFrom)) continue;
      const uuid = m[1].toLowerCase();
      const line = view.state.doc.lineAt(matchFrom);
      const lineText = line.text;
      const ranges = parseBulletRanges(
        lineText,
        matchTo - line.from,
      );
      const factId =
        factIdByLineAndSymbol.get(`${line.number}:${uuid}`) ??
        findFactAtOffset(parsed, matchFrom)?.factId ??
        null;
      const resolved = activeResolver(uuid);
      const deco = Decoration.replace({
        widget: new SymbolChipWidget(uuid, resolved, ranges.cueLabel, factId),
        inclusive: false,
      });
      if (ranges.isBullet) {
        decorations.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({
            class: ranges.emptyDescription
              ? "eng-note-symbol-line eng-note-symbol-line-empty-desc"
              : "eng-note-symbol-line",
          }),
        });
      }
      if (ranges.marker) {
        decorations.push({
          from: line.from + ranges.marker.from,
          to: line.from + ranges.marker.to,
          deco: Decoration.mark({ class: "eng-note-bullet-marker" }),
        });
      }
      if (ranges.description) {
        decorations.push({
          from: line.from + ranges.description.from,
          to: line.from + ranges.description.to,
          deco: Decoration.mark({ class: "eng-note-bullet-desc" }),
        });
      }
      if (ranges.arrow) {
        decorations.push({
          from: line.from + ranges.arrow.from,
          to: line.from + ranges.arrow.to,
          deco: Decoration.mark({ class: "eng-note-bullet-arrow" }),
        });
      }
      if (ranges.meaning) {
        decorations.push({
          from: line.from + ranges.meaning.from,
          to: line.from + ranges.meaning.to,
          deco: Decoration.mark({ class: "eng-note-bullet-meaning" }),
        });
      }
      if (ranges.semicolon) {
        decorations.push({
          from: line.from + ranges.semicolon.from,
          to: line.from + ranges.semicolon.to,
          deco: Decoration.mark({ class: "eng-note-bullet-separator" }),
        });
      }
      if (ranges.encoding) {
        decorations.push({
          from: line.from + ranges.encoding.from,
          to: line.from + ranges.encoding.to,
          deco: Decoration.mark({ class: "eng-note-bullet-encoding" }),
        });
      }
      if (ranges.emptyDescription) {
        decorations.push({
          from: matchTo,
          to: matchTo,
          deco: Decoration.widget({
            widget: new EmptyBulletGuideWidget(),
            side: 1,
          }),
        });
      }
      decorations.push({ from: matchFrom, to: matchTo, deco });
    }
  }
  return Decoration.set(
    decorations.map(({ from, to, deco }) => deco.range(from, to)),
    true,
  );
}

export const symbolChipExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      // Rebuild on doc/viewport changes (normal CM lifecycle) and on any
      // explicit external dispatch (e.g. canvas-symbols-changed, library-loaded
      // signals from React) so chip resolver state reflects latest store state.
      if (u.docChanged || u.viewportChanged || u.transactions.length > 0) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        const p = view.plugin(plugin);
        return p ? p.decorations : Decoration.none;
      }),
  },
);
