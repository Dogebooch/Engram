"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  DownloadIcon,
  FileIcon,
  FolderOpenIcon,
  ImportIcon,
  SaveIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import { useIndexStore } from "@/lib/store/index-store";
import { useBundleImport } from "@/lib/import/use-bundle-import";
import { saveCurrentPicmonicNow } from "@/lib/store/save-now";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { useExportActions } from "./use-export-actions";

const RECENT_LIMIT = 8;
const META_KEY = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl";

export function FileMenu() {
  const currentId = useCurrentPicmonicId();
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const loadPicmonicById = useStore((s) => s.loadPicmonicById);
  const index = useIndexStore((s) => s.index);
  const bundleImport = useBundleImport();
  const exportActions = useExportActions();

  const others = React.useMemo(() => {
    const list = (index ?? []).filter((e) => e.id !== currentId);
    return list.slice(0, RECENT_LIMIT);
  }, [index, currentId]);

  const handleOpen = React.useCallback(
    async (id: string) => {
      const ok = await loadPicmonicById(id);
      if (ok) setCurrentPicmonic(id);
    },
    [loadPicmonicById, setCurrentPicmonic],
  );

  const handleSave = React.useCallback(() => {
    void flushPendingSave();
    void saveCurrentPicmonicNow();
  }, []);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="File menu"
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4"
        >
          <FileIcon />
          <span>File</span>
          <ChevronDownIcon className="-ml-0.5 size-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              File
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={others.length === 0}>
              <FolderOpenIcon />
              Open
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                {others.length === 0 ? "—" : `${others.length}`}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-64 max-w-80">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Recent picmonics
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              {others.map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  onClick={() => void handleOpen(entry.id)}
                  className="gap-2"
                >
                  {entry.thumbDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.thumbDataUrl}
                      alt=""
                      className="h-6 w-10 shrink-0 rounded-sm border border-border/60 object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="h-6 w-10 shrink-0 rounded-sm border border-border/60 bg-card/40"
                    />
                  )}
                  <span className="flex-1 truncate text-sm">{entry.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCurrentPicmonic(null)}>
                Back to home…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            onClick={bundleImport.pick}
            disabled={bundleImport.busy}
          >
            <ImportIcon />
            Import…
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
              .zip
            </span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleSave} disabled={!currentId}>
            <SaveIcon />
            Save
            <DropdownMenuShortcut>{META_KEY}+S</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              disabled={!exportActions.hasPicmonic || exportActions.busy}
            >
              <DownloadIcon />
              Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              <DropdownMenuItem
                onClick={exportActions.onPng}
                disabled={!exportActions.hasStage}
              >
                PNG
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                  2× · clean
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportActions.onMarkdown}>
                Markdown
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                  notes.md
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportActions.onAnki}>
                Anki CSV
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                  per-Fact
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportActions.onBundle}>
                Bundle (.zip)
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                  all
                </span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={bundleImport.inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={bundleImport.onFile}
      />
    </>
  );
}
