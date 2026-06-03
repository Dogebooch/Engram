"use client";

import * as React from "react";
import {
  DownloadIcon,
  FileTextIcon,
  HomeIcon,
  KeyboardIcon,
  PanelRightIcon,
  PenToolIcon,
  PlayIcon,
  PlusIcon,
  ShapesIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useStore } from "@/lib/store";
import { usePicmonic, useUiPrefs } from "@/lib/store/hooks";
import { flushPendingSave } from "@/lib/store/debounced-save";
import { flushIndexPersist } from "@/lib/store/index-store";
import { parseNotes } from "@/lib/notes/parse";
import { findMissingOutlines } from "@/lib/canvas/missing-outlines";
import { useExportActions } from "./use-export-actions";

/**
 * ⌘K command palette — a keyboard-first index of the editor's verbs so repeat
 * authoring doesn't mean hunting the chrome. Reuses existing store actions and
 * the shared export hook; it owns no content state.
 */
export function CommandPalette() {
  const open = useStore((s) => s.commandPaletteOpen);
  const setOpen = useStore((s) => s.setCommandPaletteOpen);

  const picmonic = usePicmonic();
  const ui = useUiPrefs();

  const setLibraryDrawerOpen = useStore((s) => s.setLibraryDrawerOpen);
  const toggleRightCollapsed = useStore((s) => s.toggleRightCollapsed);
  const toggleTraceOnAdd = useStore((s) => s.toggleTraceOnAdd);
  const enterPlayer = useStore((s) => s.enterPlayer);
  const createPicmonic = useStore((s) => s.createPicmonic);
  const setCurrentPicmonic = useStore((s) => s.setCurrentPicmonic);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const startOutlineWalkthrough = useStore((s) => s.startOutlineWalkthrough);
  const requestOutlineConfirm = useStore((s) => s.requestOutlineConfirm);

  const exportActions = useExportActions();

  const missingCount = React.useMemo(() => {
    if (!picmonic) return 0;
    const parsed = parseNotes(picmonic.notes);
    return findMissingOutlines(picmonic.notes, parsed, picmonic.canvas.symbols)
      .length;
  }, [picmonic]);

  const run = React.useCallback(
    (fn: () => void) => {
      setOpen(false);
      // Defer so the dialog's close/focus-restore finishes before the action
      // opens another surface (drawer, player, popover).
      requestAnimationFrame(fn);
    },
    [setOpen],
  );

  const addSymbol = React.useCallback(() => {
    setLibraryDrawerOpen(true);
    window.dispatchEvent(new CustomEvent("engram:focus-library-search"));
  }, [setLibraryDrawerOpen]);

  const outlineAll = React.useCallback(() => {
    if (!picmonic) return;
    const parsed = parseNotes(picmonic.notes);
    const ids = findMissingOutlines(
      picmonic.notes,
      parsed,
      picmonic.canvas.symbols,
    ).map((m) => m.symbolId);
    if (ids.length === 0) return;
    const status = startOutlineWalkthrough(ids);
    if (status === "needs-backdrop") requestOutlineConfirm(ids[0]);
  }, [picmonic, startOutlineWalkthrough, requestOutlineConfirm]);

  const goHome = React.useCallback(async () => {
    await Promise.all([flushPendingSave(), flushIndexPersist()]);
    setCurrentPicmonic(null);
  }, [setCurrentPicmonic]);

  const inEditor = Boolean(picmonic);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Commands">
      <Command>
        <CommandInput placeholder="Type a command…" />
        <CommandList>
          <CommandEmpty>No matching commands.</CommandEmpty>

          <CommandGroup heading="Create">
            <CommandItem
              keywords={["new", "picmonic", "scene"]}
              onSelect={() => run(() => createPicmonic())}
            >
              <PlusIcon />
              New Picmonic
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            {inEditor && (
              <CommandItem
                keywords={["symbol", "library", "insert", "add"]}
                onSelect={() => run(addSymbol)}
              >
                <ShapesIcon />
                Add a symbol
                <CommandShortcut>/</CommandShortcut>
              </CommandItem>
            )}
          </CommandGroup>

          {inEditor && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Scene">
                {missingCount > 0 && (
                  <CommandItem
                    keywords={["outline", "trace", "hotspot", "walkthrough"]}
                    onSelect={() => run(outlineAll)}
                  >
                    <PenToolIcon />
                    Outline all missing
                    <CommandShortcut>{missingCount}</CommandShortcut>
                  </CommandItem>
                )}
                <CommandItem
                  keywords={["trace", "outline", "after", "add"]}
                  onSelect={() => run(toggleTraceOnAdd)}
                >
                  <PenToolIcon />
                  Trace after adding
                  <CommandShortcut>{ui.traceOnAdd ? "On" : "Off"}</CommandShortcut>
                </CommandItem>
                <CommandItem
                  keywords={["study", "play", "review", "test"]}
                  onSelect={() => run(enterPlayer)}
                >
                  <PlayIcon />
                  Study mode
                  <CommandShortcut>M</CommandShortcut>
                </CommandItem>
                <CommandItem
                  keywords={["notes", "markdown", "panel", "hide", "show"]}
                  onSelect={() => run(toggleRightCollapsed)}
                >
                  <PanelRightIcon />
                  {ui.rightCollapsed ? "Show notes" : "Hide notes"}
                  <CommandShortcut>⌘\</CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />
              <CommandGroup heading="Export">
                <CommandItem
                  disabled={!exportActions.hasStage}
                  keywords={["export", "png", "image"]}
                  onSelect={() => run(exportActions.onPng)}
                >
                  <DownloadIcon />
                  Export PNG
                </CommandItem>
                <CommandItem
                  keywords={["export", "markdown", "notes"]}
                  onSelect={() => run(exportActions.onMarkdown)}
                >
                  <FileTextIcon />
                  Export Markdown
                </CommandItem>
                <CommandItem
                  keywords={["export", "anki", "csv", "cards"]}
                  onSelect={() => run(exportActions.onAnki)}
                >
                  <FileTextIcon />
                  Export Anki CSV
                </CommandItem>
                <CommandItem
                  keywords={["export", "bundle", "zip", "backup"]}
                  onSelect={() => run(exportActions.onBundle)}
                >
                  <DownloadIcon />
                  Export Bundle (.zip)
                </CommandItem>
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="App">
            <CommandItem
              keywords={["help", "shortcuts", "keyboard"]}
              onSelect={() => run(() => setHelpOpen(true))}
            >
              <KeyboardIcon />
              Keyboard shortcuts
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
            {inEditor && (
              <CommandItem
                keywords={["home", "library", "back", "close"]}
                onSelect={() => run(() => void goHome())}
              >
                <HomeIcon />
                Back to home
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
