import {
  Decoration,
  EditorView,
  type DecorationSet,
} from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";

export const setTransientHighlightEffect = StateEffect.define<{
  line: number;
} | null>();

const lineHighlight = Decoration.line({
  attributes: { class: "eng-bullet-glow" },
});

export const transientHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setTransientHighlightEffect)) {
        if (e.value === null) {
          next = Decoration.none;
        } else {
          const linePos = tr.state.doc.line(
            Math.max(1, Math.min(e.value.line, tr.state.doc.lines)),
          ).from;
          next = Decoration.set([lineHighlight.range(linePos)]);
        }
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});
