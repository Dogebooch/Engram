"use client";

import * as React from "react";
import { ArrowRightIcon, BrainIcon, FileTextIcon, SearchIcon, ShapesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { useIndexStore } from "@/lib/store/index-store";
import type { PicmonicIndexEntry } from "@/lib/types/index-entry";
import { DeleteConfirm } from "@/components/editor/dialogs/delete-confirm";
import { RenameDialog } from "@/components/editor/dialogs/rename-dialog";
import { TagEditor } from "@/components/editor/dialogs/tag-editor";
import { HomeExportDialog } from "./export-menu";
import { PicmonicCard } from "./picmonic-card";
import { TagFilter } from "./tag-filter";

const POINTS = [
  {
    icon: ShapesIcon,
    title: "Compose",
    body: "Drag symbols from the OpenMoji library onto a 16:9 stage. Tag any symbol with one or more Facts.",
  },
  {
    icon: FileTextIcon,
    title: "Annotate",
    body: "A markdown panel mirrors the canvas. Sections → Facts → Symbol bullets, Obsidian-friendly.",
  },
  {
    icon: BrainIcon,
    title: "Study",
    body: "Toggle player mode for numbered hotspots or sequential reveal. Export PNG, Markdown, Anki CSV.",
  },
] as const;

interface DialogState {
  type: "rename" | "tags" | "delete" | "export";
  id: string;
  name: string;
  tags?: string[];
}

export function Home() {
  const index = useIndexStore((s) => s.index);
  const loading = useIndexStore((s) => s.loading);
  const createPicmonic = useStore((s) => s.createPicmonic);
  const loadPicmonicById = useStore((s) => s.loadPicmonicById);
  const deletePicmonic = useStore((s) => s.deletePicmonic);
  const duplicatePicmonic = useStore((s) => s.duplicatePicmonic);

  const [query, setQuery] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const allTags = React.useMemo(() => {
    if (!index) return [] as string[];
    const set = new Set<string>();
    for (const e of index) for (const t of e.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [index]);

  const filtered = React.useMemo<PicmonicIndexEntry[]>(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    return index
      .filter((e) => {
        if (q && !e.name.toLowerCase().includes(q)) return false;
        if (selectedTags.size === 0) return true;
        for (const t of selectedTags) {
          if (!e.tags.includes(t)) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [index, query, selectedTags]);

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const clearTags = () => setSelectedTags(new Set());

  const handleOpen = async (id: string) => {
    await loadPicmonicById(id);
  };

  const onConfirmDelete = async () => {
    if (!dialog || dialog.type !== "delete") return;
    await deletePicmonic(dialog.id);
  };

  const onDuplicate = async (id: string) => {
    await duplicatePicmonic(id);
  };

  // Empty index: keep the existing welcome hero. No churn.
  if (!loading && (index?.length ?? 0) === 0) {
    return <EmptyHero onCreate={() => createPicmonic()} />;
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-stage">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-16 pt-8">
        <header className="flex items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              your library
            </span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Picmonics
            </h1>
          </div>
          <div className="font-mono text-[11px] tabular-nums tracking-tight text-muted-foreground">
            {(index?.length ?? 0)} total
          </div>
        </header>

        <div className="flex flex-col gap-3">
          <div className="relative max-w-sm">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              placeholder="Search by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-7"
            />
          </div>
          <TagFilter
            allTags={allTags}
            selected={selectedTags}
            onToggle={toggleTag}
            onClear={clearTags}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              No Picmonics match those filters.
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); clearTags(); }}>
              Clear filters
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((entry) => (
              <li key={entry.id}>
                <PicmonicCard
                  entry={entry}
                  now={now}
                  selectedTags={selectedTags}
                  onTagClick={toggleTag}
                  onOpen={() => handleOpen(entry.id)}
                  onRename={() =>
                    setDialog({ type: "rename", id: entry.id, name: entry.name })
                  }
                  onEditTags={() =>
                    setDialog({
                      type: "tags",
                      id: entry.id,
                      name: entry.name,
                      tags: entry.tags,
                    })
                  }
                  onDuplicate={() => onDuplicate(entry.id)}
                  onExport={() =>
                    setDialog({ type: "export", id: entry.id, name: entry.name })
                  }
                  onDelete={() =>
                    setDialog({ type: "delete", id: entry.id, name: entry.name })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <RenameDialog
        picmonicId={dialog?.type === "rename" ? dialog.id : null}
        initialName={dialog?.type === "rename" ? dialog.name : ""}
        open={dialog?.type === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <TagEditor
        picmonicId={dialog?.type === "tags" ? dialog.id : null}
        initialTags={dialog?.type === "tags" ? dialog.tags : []}
        open={dialog?.type === "tags"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <DeleteConfirm
        open={dialog?.type === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.type === "delete" ? `Delete "${dialog.name}"?` : undefined}
        onConfirm={onConfirmDelete}
      />
      <HomeExportDialog
        picmonicId={dialog?.type === "export" ? dialog.id : null}
        picmonicName={dialog?.type === "export" ? dialog.name : ""}
        open={dialog?.type === "export"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
    </div>
  );
}

function EmptyHero({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-stage p-10">
      <div className="relative flex w-full max-w-2xl flex-col items-start gap-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -top-24 -z-10 size-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            v0.1 · phase 6
          </span>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            Build your first mnemonic scene.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            engram is a local-first, Obsidian-native editor for Picmonic-style mnemonics.
            Nothing leaves your machine. Refresh-safe. Markdown is the source of truth.
          </p>
        </div>
        <Button
          size="lg"
          onClick={onCreate}
          className="group bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Create your first Picmonic
          <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
        </Button>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-lg border border-border/60 bg-card/40 p-4 transition-colors hover:border-border hover:bg-card/70"
            >
              <div className="mb-3 flex size-7 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground transition-colors group-hover:text-accent">
                <Icon className="size-3.5" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/90">
                {title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
