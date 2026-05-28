import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import {
  type Extension,
  StateField,
  type EditorState,
  type Text as CMText,
} from "@codemirror/state";
import { parseNotes } from "../parse";
import type { ParsedFact } from "../types";

/**
 * Decorates each line of every `## Fact` block (heading + its body lines)
 * with `data-fact-block`, `data-fact-id`, and `data-fact-block-position`
 * attributes so the canvas drag-tag bridge can hit-test the entire fact
 * block via `document.elementFromPoint`. Empty facts (heading with no body
 * content) get a `Decoration.widget` ghost slot beneath the heading that
 * expands while the user is dragging, giving the drop zone presence in
 * the layout (and pushing facts below downward, which collapses back on
 * drop).
 *
 * Implemented as a StateField (not a ViewPlugin) because CodeMirror 6
 * disallows block decorations from view plugins.
 */

let activeOnAddToFact: ((factId: string) => void) | null = null;

export function setFactHeadingOnAddToFact(
  handler: (factId: string) => void,
): void {
  activeOnAddToFact = handler;
}

/**
 * The bottom edge of every fact card: closes the card visually (the doc lines
 * only round the top) and offers "+ symbol", which arms this fact as the
 * library add-target. Carries `data-fact-block` so it is also a valid
 * drop target for both the canvas tag-drag and the row-move drag.
 */
class FactFooterWidget extends WidgetType {
  constructor(
    readonly factId: string,
    readonly isActive: boolean,
  ) {
    super();
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof FactFooterWidget &&
      other.factId === this.factId &&
      other.isActive === this.isActive
    );
  }
  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "eng-fact-footer";
    div.setAttribute("data-fact-block", this.factId);
    div.setAttribute("data-fact-id", this.factId);
    if (this.isActive) div.setAttribute("data-fact-active", "true");
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", "Add a symbol to this Fact");
    const plus = document.createElement("span");
    plus.className = "eng-fact-footer__plus";
    plus.textContent = "+";
    div.appendChild(plus);
    const label = document.createElement("span");
    label.textContent = "symbol";
    div.appendChild(label);
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    div.addEventListener("pointerdown", stop);
    div.addEventListener("mousedown", stop);
    div.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeOnAddToFact?.(this.factId);
    });
    return div;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

/** Insert a `# `/`## ` heading at `atOffset`, on its own line, cursor ready. */
function insertHeading(view: EditorView, atOffset: number, level: 1 | 2): void {
  const doc = view.state.doc;
  const prefix = level === 1 ? "# " : "## ";
  const atLineStart =
    atOffset === 0 || doc.sliceString(atOffset - 1, atOffset) === "\n";
  const insert = atLineStart ? `${prefix}\n` : `\n${prefix}`;
  const anchor = atOffset + (atLineStart ? prefix.length : 1 + prefix.length);
  view.dispatch({
    changes: { from: atOffset, insert },
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
}

/**
 * Outline-level "+ fact" / "+ section" affordance. A quiet ghost row that
 * inserts a heading and drops the cursor into it.
 */
class InsertHeadingWidget extends WidgetType {
  constructor(
    readonly offset: number,
    readonly level: 1 | 2,
    readonly label: string,
  ) {
    super();
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof InsertHeadingWidget &&
      other.offset === this.offset &&
      other.level === this.level
    );
  }
  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("div");
    div.className = `eng-outline-add eng-outline-add--${this.level === 1 ? "section" : "fact"}`;
    div.setAttribute("role", "button");
    div.setAttribute(
      "aria-label",
      this.level === 1 ? "Add a section" : "Add a fact",
    );
    const plus = document.createElement("span");
    plus.className = "eng-outline-add__plus";
    plus.textContent = "+";
    div.appendChild(plus);
    const label = document.createElement("span");
    label.textContent = this.label;
    div.appendChild(label);
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    div.addEventListener("pointerdown", stop);
    div.addEventListener("mousedown", stop);
    div.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertHeading(view, this.offset, this.level);
    });
    return div;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

interface BlockRange {
  factId: string;
  startLine: number;
  endLine: number;
  isEmpty: boolean;
}

function computeBlockRange(fact: ParsedFact, doc: CMText): BlockRange | null {
  if (fact.headingLine < 1 || fact.headingLine > doc.lines) return null;
  const startLine = fact.headingLine;
  let endLine: number;
  if (fact.bodyRange.to >= doc.length) {
    endLine = doc.lines;
  } else {
    const boundary = doc.lineAt(fact.bodyRange.to).number;
    endLine = Math.max(startLine, boundary - 1);
  }
  let isEmpty = fact.symbolRefs.length === 0;
  if (isEmpty) {
    for (let l = startLine + 1; l <= endLine; l++) {
      if (doc.line(l).text.trim().length > 0) {
        isEmpty = false;
        break;
      }
    }
  }
  return { factId: fact.factId, startLine, endLine, isEmpty };
}

function buildDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const parsed = parseNotes(doc.toString());
  const cursorLine = doc.lineAt(state.selection.main.head).number;
  // Collected unsorted; Decoration.set(..., true) sorts. (A RangeSetBuilder
  // would throw here because section and fact decorations interleave in the
  // document but are emitted in two separate passes.)
  const out: { from: number; to: number; deco: Decoration }[] = [];

  for (const section of parsed.sections) {
    if (section.headingLine < 1 || section.headingLine > doc.lines) continue;
    const line = doc.line(section.headingLine);
    out.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ attributes: { class: "eng-note-section-line" } }),
    });
  }

  const facts = Array.from(parsed.factsById.values()).sort(
    (a, b) => a.headingLine - b.headingLine,
  );

  for (const fact of facts) {
    const range = computeBlockRange(fact, doc);
    if (!range) continue;
    const { factId, startLine, endLine, isEmpty } = range;

    // The fact the cursor sits in lights its whole card's left spine.
    const isActive = cursorLine >= startLine && cursorLine <= endLine;

    // Empty facts collapse to just the heading line; the footer below closes
    // the card and offers "+ symbol".
    const lastLine = isEmpty ? startLine : endLine;
    const onlyOneLine = startLine === lastLine;

    for (let l = startLine; l <= lastLine; l++) {
      const line = doc.line(l);
      const position = onlyOneLine
        ? "only"
        : l === startLine
          ? "first"
          : l === lastLine
            ? "last"
            : "middle";
      const attributes: Record<string, string> = {
        class:
          l === startLine
            ? "eng-note-fact-line eng-note-fact-heading-line"
            : "eng-note-fact-line",
        "data-fact-block": factId,
        "data-fact-id": factId,
        "data-fact-block-position": position,
      };
      if (isActive) attributes["data-fact-active"] = "true";
      out.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ attributes }),
      });
    }

    const footerPos = doc.line(lastLine).to;
    out.push({
      from: footerPos,
      to: footerPos,
      deco: Decoration.widget({
        widget: new FactFooterWidget(factId, isActive),
        block: true,
        side: 1,
      }),
    });
  }

  // Outline-level add affordances, once there is some content to anchor them.
  if (parsed.sections.length > 0 || facts.length > 0) {
    const sections = parsed.sections
      .filter((s) => s.headingLine >= 1 && s.headingLine <= doc.lines)
      .sort((a, b) => a.headingLine - b.headingLine);

    const factPositions: number[] = [];
    if (sections.length > 0) {
      for (let i = 0; i < sections.length; i++) {
        const endLine =
          i + 1 < sections.length ? sections[i + 1].headingLine - 1 : doc.lines;
        const safeEnd = Math.min(
          doc.lines,
          Math.max(sections[i].headingLine, endLine),
        );
        factPositions.push(doc.line(safeEnd).to);
      }
    } else {
      factPositions.push(doc.line(doc.lines).to);
    }
    for (const pos of factPositions) {
      out.push({
        from: pos,
        to: pos,
        deco: Decoration.widget({
          widget: new InsertHeadingWidget(pos, 2, "fact"),
          block: true,
          side: 2,
        }),
      });
    }

    const endPos = doc.line(doc.lines).to;
    out.push({
      from: endPos,
      to: endPos,
      deco: Decoration.widget({
        widget: new InsertHeadingWidget(endPos, 1, "section"),
        block: true,
        side: 3,
      }),
    });
  }

  return Decoration.set(
    out.map(({ from, to, deco }) => deco.range(from, to)),
    true,
  );
}

const factBlockField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const factHeadingExtension: Extension = factBlockField;
