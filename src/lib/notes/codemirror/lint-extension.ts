import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { useStore } from "@/lib/store";
import { parseNotes } from "../parse";
import { lintNotes, type LintIssue } from "../lint";

function toDiagnostic(issue: LintIssue): Diagnostic {
  return {
    from: issue.from,
    to: issue.to,
    severity: issue.severity,
    source: "engram",
    message: `[${issue.code}] ${issue.message}`,
  };
}

export function buildBulletLinterExtension(): Extension {
  return linter((view) => {
    const text = view.state.doc.toString();
    const parsed = parseNotes(text);
    const s = useStore.getState();
    const cid = s.currentPicmonicId;
    const symbols = cid ? s.picmonics[cid]?.canvas.symbols ?? [] : [];
    const known = new Set(symbols.map((sy) => sy.id.toLowerCase()));
    return lintNotes(text, parsed, known).map(toDiagnostic);
  });
}
