"use client";

import * as React from "react";
import { CheckIcon, CircleIcon, XIcon } from "lucide-react";
import { usePicmonic } from "@/lib/store/hooks";
import { parseNotes } from "@/lib/notes/parse";
import { UNASSIGNED_FACT_NAME } from "@/lib/notes/types";

const DISMISS_KEY = "engram:setup-checklist-dismissed";

interface Step {
  label: string;
  done: boolean;
}

/**
 * Three-step progress chip rendered on the canvas while a picmonic is
 * incomplete: backdrop → at least one outline → at least one tagged fact.
 * Auto-hides when all three are complete. Dismissible (sticky via
 * localStorage) for users who don't want guidance after the first run.
 *
 * Modeled on Notion's empty-state checklists and Figma's onboarding
 * progress — guidance without claiming canvas real estate forever.
 */
export function SetupChecklist() {
  const picmonic = usePicmonic();
  const [dismissed, setDismissed] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const steps: Step[] = React.useMemo(() => {
    if (!picmonic) return [];
    const hasBackdrop = Boolean(picmonic.canvas.backdrop?.uploadedBlobId);
    const hasOutline = picmonic.canvas.symbols.length > 0;
    let hasTaggedFact = false;
    const parsed = parseNotes(picmonic.notes ?? "");
    for (const f of parsed.factsById.values()) {
      if (f.name === UNASSIGNED_FACT_NAME) continue;
      if (f.symbolRefs.length > 0) {
        hasTaggedFact = true;
        break;
      }
    }
    return [
      { label: "Add background", done: hasBackdrop },
      { label: "Outline a symbol", done: hasOutline },
      { label: "Tag with a fact", done: hasTaggedFact },
    ];
  }, [picmonic]);

  const allDone = steps.every((s) => s.done);

  if (!picmonic || allDone || dismissed) return null;

  const onDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/60 bg-card/85 px-3 py-1.5 shadow-lg backdrop-blur-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Setup
      </span>
      <ol className="flex items-center gap-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {step.done ? (
              <CheckIcon
                className="size-3 text-[var(--accent)]"
                aria-label="done"
              />
            ) : (
              <CircleIcon
                className="size-3 text-muted-foreground/70"
                aria-label="todo"
              />
            )}
            <span
              className={`text-[11px] ${
                step.done
                  ? "text-muted-foreground/60 line-through"
                  : "text-foreground/85"
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss setup checklist"
        className="ml-1 flex size-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
