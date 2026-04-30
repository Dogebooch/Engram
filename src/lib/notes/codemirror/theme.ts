import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const fontStack =
  'var(--font-mono), ui-monospace, "JetBrains Mono", "Fira Code", monospace';
const sansStack = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif';

export const engramEditorTheme = EditorView.theme(
  {
    "&": {
      color: "var(--foreground)",
      backgroundColor: "transparent",
      height: "100%",
      fontSize: "12.5px",
      fontFamily: fontStack,
    },
    ".cm-scroller": {
      fontFamily: fontStack,
      lineHeight: "1.7",
      padding: "14px 18px 80px",
      overflowY: "auto",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      color: "var(--foreground)",
      padding: "0",
    },
    ".cm-line": {
      padding: "0 4px",
    },
    "&.cm-editor.cm-focused": {
      outline: "none",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeft: "1.5px solid var(--accent)",
      borderRadius: "1px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor: "color-mix(in oklch, var(--accent) 25%, transparent)",
      },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      display: "none",
    },
  },
  { dark: true },
);

const headingColor = "var(--foreground)";
const subHeadingColor = "color-mix(in oklch, var(--foreground) 88%, transparent)";

export const engramHighlightStyle = HighlightStyle.define([
  // h1 = Section. Editorial dateline feel: medium weight, tight tracking, sans.
  {
    tag: t.heading1,
    color: headingColor,
    fontFamily: sansStack,
    fontWeight: "600",
    fontSize: "15.5px",
    letterSpacing: "-0.018em",
    lineHeight: "1.4",
  },
  // h2 = Fact. Distinctly demoted: monospace caps-style title, amber tint.
  {
    tag: t.heading2,
    color: subHeadingColor,
    fontFamily: sansStack,
    fontWeight: "550",
    fontSize: "12.5px",
    letterSpacing: "0.005em",
    lineHeight: "1.5",
  },
  {
    tag: t.heading3,
    color: "var(--muted-foreground)",
    fontWeight: "500",
    fontSize: "11.5px",
    fontFamily: sansStack,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  // The leading `#` / `##` markers — dim them so headings read as titles
  {
    tag: t.heading,
    color: "color-mix(in oklch, var(--muted-foreground) 50%, transparent)",
  },
  {
    tag: t.processingInstruction,
    color: "color-mix(in oklch, var(--accent) 50%, transparent)",
    fontFamily: fontStack,
  },
  {
    tag: t.strong,
    color: "var(--foreground)",
    fontWeight: "600",
  },
  {
    tag: t.emphasis,
    fontStyle: "italic",
    color: "color-mix(in oklch, var(--foreground) 92%, transparent)",
  },
  {
    tag: t.link,
    color: "var(--accent)",
    textDecoration: "underline",
    textDecorationThickness: "1px",
    textUnderlineOffset: "2px",
  },
  {
    tag: t.url,
    color:
      "color-mix(in oklch, var(--muted-foreground) 70%, transparent)",
  },
  {
    tag: t.monospace,
    color: "color-mix(in oklch, var(--accent) 55%, var(--foreground) 50%)",
    fontFamily: fontStack,
    fontSize: "11.5px",
  },
  // List bullet markers — quieter, slightly recessed
  {
    tag: t.list,
    color: "color-mix(in oklch, var(--muted-foreground) 70%, transparent)",
  },
  {
    tag: t.contentSeparator,
    color: "color-mix(in oklch, var(--muted-foreground) 35%, transparent)",
  },
  {
    tag: t.quote,
    color: "var(--muted-foreground)",
    fontStyle: "italic",
  },
  {
    tag: t.meta,
    color: "color-mix(in oklch, var(--muted-foreground) 55%, transparent)",
    fontFamily: fontStack,
  },
  {
    tag: t.comment,
    color: "color-mix(in oklch, var(--muted-foreground) 45%, transparent)",
    fontStyle: "italic",
  },
]);

export const engramSyntaxHighlighting = syntaxHighlighting(
  engramHighlightStyle,
);
