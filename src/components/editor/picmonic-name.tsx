"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";

export function PicmonicName() {
  const picmonic = usePicmonic();
  const renamePicmonic = useStore((s) => s.renamePicmonic);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  if (!picmonic) return null;

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== picmonic.meta.name) {
      renamePicmonic(picmonic.id, trimmed);
    }
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        spellCheck={false}
        aria-label="Picmonic name"
        className={cn(
          "h-7 min-w-[12rem] max-w-[26rem] rounded-md border border-accent/40 bg-background/80",
          "px-2 text-sm font-medium text-foreground outline-none",
          "ring-2 ring-accent/15 focus-visible:ring-accent/30",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(picmonic.meta.name);
        setEditing(true);
      }}
      title="Click to rename"
      className={cn(
        "group flex h-7 max-w-[26rem] items-center gap-2 rounded-md px-2",
        "text-sm font-medium text-foreground/90",
        "transition-colors hover:bg-muted/60 hover:text-foreground",
        "focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
      )}
    >
      <span className="truncate">{picmonic.meta.name}</span>
      <span
        aria-hidden="true"
        className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/80"
      >
        rename
      </span>
    </button>
  );
}
