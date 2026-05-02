import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import {
  type Extension,
  RangeSetBuilder,
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

class EmptyFactGhostWidget extends WidgetType {
  constructor(readonly factId: string) {
    super();
  }
  eq(other: WidgetType): boolean {
    return other instanceof EmptyFactGhostWidget && other.factId === this.factId;
  }
  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "eng-empty-fact-ghost";
    div.setAttribute("data-fact-block", this.factId);
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
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  const parsed = parseNotes(doc.toString());
  const facts = Array.from(parsed.factsById.values()).sort(
    (a, b) => a.headingLine - b.headingLine,
  );

  for (const fact of facts) {
    const range = computeBlockRange(fact, doc);
    if (!range) continue;
    const { factId, startLine, endLine, isEmpty } = range;

    // Empty facts: the ghost widget IS the visual body. Decorating the
    // trailing blank line(s) too would stack a second box under the ghost.
    // Treat the heading as a single-line block and let the ghost close it.
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
      builder.add(
        line.from,
        line.from,
        Decoration.line({
          attributes: {
            "data-fact-block": factId,
            "data-fact-id": factId,
            "data-fact-block-position": position,
          },
        }),
      );
      if (isEmpty && l === startLine) {
        builder.add(
          line.to,
          line.to,
          Decoration.widget({
            widget: new EmptyFactGhostWidget(factId),
            block: true,
            side: 1,
          }),
        );
      }
    }
  }
  return builder.finish();
}

const factBlockField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const factHeadingExtension: Extension = factBlockField;
