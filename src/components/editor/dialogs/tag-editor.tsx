"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { useIndexStore } from "@/lib/store/index-store";

interface TagEditorProps {
  picmonicId: string | null;
  initialTags?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function dedup(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function TagEditor({
  picmonicId,
  initialTags,
  open,
  onOpenChange,
}: TagEditorProps) {
  const setPicmonicTags = useStore((s) => s.setPicmonicTags);
  const allEntries = useIndexStore((s) => s.index);

  const [tags, setTags] = React.useState<string[]>(initialTags ?? []);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setTags(initialTags ?? []);
      setDraft("");
      // focus after a tick so dialog mount completes
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, initialTags]);

  const allKnownTags = React.useMemo(() => {
    if (!allEntries) return [];
    const set = new Set<string>();
    for (const e of allEntries) for (const t of e.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allEntries]);

  const suggestions = React.useMemo(() => {
    const q = draft.trim().toLowerCase();
    const taken = new Set(tags.map((t) => t.toLowerCase()));
    const pool = allKnownTags.filter((t) => !taken.has(t.toLowerCase()));
    if (!q) return pool.slice(0, 8);
    return pool.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
  }, [allKnownTags, draft, tags]);

  const commit = (raw: string) => {
    const clean = dedup([...tags, raw]);
    setTags(clean);
    setDraft("");
  };

  const remove = (t: string) => {
    setTags(tags.filter((x) => x !== t));
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      e.preventDefault();
      setTags(tags.slice(0, -1));
    } else if (e.key === "Escape" && draft) {
      e.preventDefault();
      setDraft("");
    }
  };

  const onSave = () => {
    if (!picmonicId) {
      onOpenChange(false);
      return;
    }
    const finalTags = draft.trim() ? dedup([...tags, draft]) : tags;
    setPicmonicTags(picmonicId, finalTags);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Edit tags
          </DialogTitle>
          <DialogDescription>
            Tags help you filter the library. Press Enter to add.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-input/20 px-2 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-sm bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-accent-foreground/90 ring-1 ring-accent/30"
            >
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remove ${t}`}
                className="rounded text-muted-foreground/80 transition-colors hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tags.length === 0 ? "physiology, pharm…" : ""}
            className="h-6 min-w-[8ch] flex-1 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              suggestions
            </span>
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => commit(t)}
                className="inline-flex items-center rounded-sm border border-border/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
