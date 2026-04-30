import { EditorView, drawSelection, highlightActiveLine, keymap } from "@codemirror/view";
import { EditorState, Extension } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { engramEditorTheme, engramSyntaxHighlighting } from "./theme";

export function buildBaseExtensions(): Extension[] {
  return [
    history(),
    drawSelection(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    indentUnit.of("  "),
    markdown({ base: markdownLanguage, addKeymap: true }),
    engramSyntaxHighlighting,
    engramEditorTheme,
  ];
}
