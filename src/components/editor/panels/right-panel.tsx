"use client";

import { FileTextIcon } from "lucide-react";

export function RightPanel() {
  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Notes
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground">
          <FileTextIcon className="size-4" />
        </div>
        <p className="text-sm font-medium text-foreground">Markdown notes</p>
        <p className="max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
          CodeMirror editor lands here in Phase 3. Sections, Facts, and Symbol bullets sync
          bidirectionally with the canvas.
        </p>
        <pre className="mt-4 w-full max-w-[28ch] overflow-x-auto rounded-md border border-border bg-background/60 px-3 py-2 text-left font-mono text-[10px] leading-relaxed text-muted-foreground">
{`# Section
## Fact name
* {sym:UUID} desc → meaning;
   note (why)`}
        </pre>
      </div>
    </div>
  );
}
