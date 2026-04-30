import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  type DecorationSet,
} from "@codemirror/view";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import { parseNotes } from "../parse";

/**
 * Decorates every `## Fact` heading line with `data-fact-heading` and
 * `data-fact-id` attributes so the canvas drag-tag bridge can hit-test via
 * `document.elementFromPoint`. We re-parse the doc on `docChanged` only
 * (not on every viewport update) to keep keystrokes cheap.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const parsed = parseNotes(doc.toString());
  // Sort facts by headingLine so RangeSetBuilder receives them in order.
  const facts = Array.from(parsed.factsById.values()).sort(
    (a, b) => a.headingLine - b.headingLine,
  );
  for (const fact of facts) {
    if (fact.headingLine < 1 || fact.headingLine > doc.lines) continue;
    const line = doc.line(fact.headingLine);
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        attributes: {
          "data-fact-heading": "",
          "data-fact-id": fact.factId,
        },
      }),
    );
  }
  return builder.finish();
}

export const factHeadingExtension: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
