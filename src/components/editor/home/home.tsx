"use client";

import * as React from "react";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DeleteConfirm } from "@/components/editor/dialogs/delete-confirm";
import { RenameDialog } from "@/components/editor/dialogs/rename-dialog";
import { useStore } from "@/lib/store";
import {
  isFolderDescendant,
  useIndexStore,
} from "@/lib/store/index-store";
import { loadMedicineVideos, type MedicineVideosLoadResult } from "@/lib/medicine-videos";
import { UNFILED_FOLDER_ID, type FolderNode } from "@/lib/types/folder";
import type { PicmonicIndexEntry } from "@/lib/types/index-entry";
import { cn } from "@/lib/utils";
import { HomeExportDialog } from "./export-menu";
import { ImportButton } from "./import-button";
import { ImportChecklistRail } from "./import-checklist-rail";
import { PicmonicCard } from "./picmonic-card";

type DragState = { type: "picmonic" | "folder"; id: string } | null;
type SelectedFolderId = string | null;

interface DialogState {
  type: "rename" | "delete" | "export" | "move";
  id: string;
  name: string;
}

export function Home() {
  const rawIndex = useIndexStore((s) => s.index);
  const rawFolders = useIndexStore((s) => s.folders);
  const index = React.useMemo(() => rawIndex ?? [], [rawIndex]);
  const folders = React.useMemo(() => rawFolders ?? [], [rawFolders]);
  const loading = useIndexStore((s) => s.loading);
  const createFolder = useIndexStore((s) => s.createFolder);
  const renameFolder = useIndexStore((s) => s.renameFolder);
  const moveFolder = useIndexStore((s) => s.moveFolder);
  const deleteFolderNode = useIndexStore((s) => s.deleteFolderNode);

  const createPicmonic = useStore((s) => s.createPicmonic);
  const loadPicmonicById = useStore((s) => s.loadPicmonicById);
  const deletePicmonic = useStore((s) => s.deletePicmonic);
  const duplicatePicmonic = useStore((s) => s.duplicatePicmonic);
  const setPicmonicFolder = useStore((s) => s.setPicmonicFolder);

  const [selectedFolderId, setSelectedFolderId] = React.useState<SelectedFolderId>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [query, setQuery] = React.useState("");
  const [searchAll, setSearchAll] = React.useState(false);
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [folderDialog, setFolderDialog] = React.useState<
    | { type: "create"; parentId: string | null }
    | { type: "rename"; folder: FolderNode }
    | { type: "move"; folder: FolderNode }
    | null
  >(null);
  const [folderDelete, setFolderDelete] = React.useState<FolderNode | null>(null);
  const [dragging, setDragging] = React.useState<DragState>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [medicineVideos, setMedicineVideos] =
    React.useState<MedicineVideosLoadResult>({
      status: "unavailable",
      videos: [],
      message: "Loading Medicine Videos...",
    });

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void loadMedicineVideos().then((result) => {
      if (!cancelled) setMedicineVideos(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const unfiledCount = React.useMemo(
    () => index.filter((e) => (e.folderId ?? null) === null).length,
    [index],
  );
  const selectedIsUnfiled = selectedFolderId === UNFILED_FOLDER_ID;
  const activeFolderId = selectedIsUnfiled ? null : selectedFolderId;

  const selectedFolder = selectedFolderId && !selectedIsUnfiled
    ? folders.find((f) => f.id === selectedFolderId) ?? null
    : null;
  const breadcrumbs = React.useMemo(
    () => (selectedIsUnfiled ? [] : folderPath(folders, selectedFolderId)),
    [folders, selectedFolderId, selectedIsUnfiled],
  );

  const childFolders = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (searchAll && q) return [];
    if (selectedIsUnfiled) return [];
    return folders
      .filter((f) => f.parentId === selectedFolderId)
      .filter((f) => !q || f.name.toLowerCase().includes(q));
  }, [folders, query, searchAll, selectedFolderId, selectedIsUnfiled]);
  const showUnfiledTile =
    !searchAll &&
    selectedFolderId === null &&
    (!query.trim() || "unfiled".includes(query.trim().toLowerCase()));
  const hasVisibleFolders = childFolders.length > 0 || showUnfiledTile;

  const visibleEntries = React.useMemo<PicmonicIndexEntry[]>(() => {
    const q = query.trim().toLowerCase();
    return index
      .filter((e) => {
        if (!searchAll) {
          if (selectedIsUnfiled) {
            if ((e.folderId ?? null) !== null) return false;
          } else if (selectedFolderId === null) {
            return false;
          } else if ((e.folderId ?? null) !== selectedFolderId) {
            return false;
          }
        }
        if (q && !e.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [index, query, searchAll, selectedFolderId, selectedIsUnfiled]);

  const allMedicineVideos =
    medicineVideos.status === "ok" ? medicineVideos.videos : [];

  const handleDropToFolder = async (folderId: string | null) => {
    if (!dragging) return;
    if (dragging.type === "picmonic") {
      await setPicmonicFolder(dragging.id, folderId);
    } else {
      moveFolder(dragging.id, folderId);
    }
    setDragging(null);
  };

  const onConfirmDelete = async () => {
    if (!dialog || dialog.type !== "delete") return;
    await deletePicmonic(dialog.id);
  };

  const onConfirmFolderDelete = async () => {
    if (!folderDelete) return;
    const parentId = folderDelete.parentId ?? null;
    const directEntries = index.filter((e) => (e.folderId ?? null) === folderDelete.id);
    await Promise.all(directEntries.map((e) => setPicmonicFolder(e.id, parentId)));
    deleteFolderNode(folderDelete.id);
    if (selectedFolderId === folderDelete.id) setSelectedFolderId(parentId);
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-stage text-sm text-muted-foreground">Loading library...</div>;
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-stage">
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border/60 bg-card/25">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Library
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {index.length} Picmonics
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setFolderDialog({ type: "create", parentId: activeFolderId })}
            aria-label="New folder"
          >
            <PlusIcon />
          </Button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto p-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => void handleDropToFolder(null)}
        >
          <FolderTreeRoot
            selected={!selectedFolderId}
            onSelect={() => setSelectedFolderId(null)}
            onDrop={() => void handleDropToFolder(null)}
          />
          <UnfiledFolderRow
            selected={selectedIsUnfiled}
            count={unfiledCount}
            onSelect={() => setSelectedFolderId(UNFILED_FOLDER_ID)}
            onDrop={() => void handleDropToFolder(null)}
          />
          <FolderTree
            folders={folders}
            parentId={null}
            selectedFolderId={selectedFolderId}
            expanded={expanded}
            dragging={dragging}
            onToggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onSelect={setSelectedFolderId}
            onDragStart={setDragging}
            onDrop={(id) => void handleDropToFolder(id)}
            onCreate={(parentId) => setFolderDialog({ type: "create", parentId })}
            onRename={(folder) => setFolderDialog({ type: "rename", folder })}
            onMove={(folder) => setFolderDialog({ type: "move", folder })}
            onDelete={setFolderDelete}
          />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 pb-16 pt-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <button type="button" onClick={() => setSelectedFolderId(null)} className="hover:text-foreground">
                  Library
                </button>
                {breadcrumbs.map((folder) => (
                  <React.Fragment key={folder.id}>
                    <ChevronRightIcon className="size-3" />
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(folder.id)}
                      className="hover:text-foreground"
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold text-foreground">
                {selectedIsUnfiled ? "Unfiled" : selectedFolder?.name ?? "Library"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => createPicmonic("Untitled Picmonic", activeFolderId)}
              >
                <PlusIcon />
                New
              </Button>
              <ImportButton folderId={activeFolderId} medicineVideos={allMedicineVideos} />
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
              />
              <Input
                placeholder="Search Picmonics and folders..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-7"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={searchAll} onCheckedChange={(checked) => setSearchAll(checked === true)} />
              Search all folders
            </label>
          </div>

          {showUnfiledTile || (!searchAll && selectedFolderId === null && childFolders.length > 0) ? (
            <section>
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Folders
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {showUnfiledTile ? (
                  <li>
                    <VirtualFolderTile
                      name="Unfiled"
                      count={unfiledCount}
                      onOpen={() => setSelectedFolderId(UNFILED_FOLDER_ID)}
                      onDrop={() => void handleDropToFolder(null)}
                    />
                  </li>
                ) : null}
                {childFolders.map((folder) => (
                  <li key={folder.id}>
                    <FolderTile
                      folder={folder}
                      count={index.filter((e) => (e.folderId ?? null) === folder.id).length}
                      onOpen={() => setSelectedFolderId(folder.id)}
                      onDragStart={() => setDragging({ type: "folder", id: folder.id })}
                      onDrop={() => void handleDropToFolder(folder.id)}
                      onCreate={() => setFolderDialog({ type: "create", parentId: folder.id })}
                      onRename={() => setFolderDialog({ type: "rename", folder })}
                      onMove={() => setFolderDialog({ type: "move", folder })}
                      onDelete={() => setFolderDelete(folder)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : childFolders.length > 0 ? (
            <section>
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Folders
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {childFolders.map((folder) => (
                  <li key={folder.id}>
                    <FolderTile
                      folder={folder}
                      count={index.filter((e) => (e.folderId ?? null) === folder.id).length}
                      onOpen={() => setSelectedFolderId(folder.id)}
                      onDragStart={() => setDragging({ type: "folder", id: folder.id })}
                      onDrop={() => void handleDropToFolder(folder.id)}
                      onCreate={() => setFolderDialog({ type: "create", parentId: folder.id })}
                      onRename={() => setFolderDialog({ type: "rename", folder })}
                      onMove={() => setFolderDialog({ type: "move", folder })}
                      onDelete={() => setFolderDelete(folder)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {visibleEntries.length === 0 && !hasVisibleFolders ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-14 text-center">
              <p className="text-sm text-muted-foreground">
                {query ? "No Picmonics match this search." : "This folder is empty."}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => createPicmonic("Untitled Picmonic", activeFolderId)}
              >
                Create Picmonic
              </Button>
            </div>
          ) : visibleEntries.length > 0 ? (
            <section>
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Picmonics
              </h2>
              <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleEntries.map((entry) => (
                  <li
                    key={entry.id}
                    draggable
                    onDragStart={() => setDragging({ type: "picmonic", id: entry.id })}
                    onDragEnd={() => setDragging(null)}
                  >
                    <PicmonicCard
                      entry={entry}
                      now={now}
                      onOpen={() => void loadPicmonicById(entry.id)}
                      onRename={() => setDialog({ type: "rename", id: entry.id, name: entry.name })}
                      onMove={() => setDialog({ type: "move", id: entry.id, name: entry.name })}
                      onDuplicate={() => void duplicatePicmonic(entry.id)}
                      onExport={() => setDialog({ type: "export", id: entry.id, name: entry.name })}
                      onDelete={() => setDialog({ type: "delete", id: entry.id, name: entry.name })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>

      <ImportChecklistRail loadResult={medicineVideos} index={index} />

      <RenameDialog
        picmonicId={dialog?.type === "rename" ? dialog.id : null}
        initialName={dialog?.type === "rename" ? dialog.name : ""}
        open={dialog?.type === "rename"}
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
      <FolderNameDialog
        state={folderDialog}
        folders={folders}
        onClose={() => setFolderDialog(null)}
        onCreate={(name, parentId) => {
          const id = createFolder(name, parentId);
          setExpanded((prev) => new Set(prev).add(parentId ?? ""));
          setSelectedFolderId(id);
        }}
        onRename={(id, name) => renameFolder(id, name)}
        onMove={(id, parentId) => moveFolder(id, parentId)}
      />
      <MovePicmonicDialog
        entry={dialog?.type === "move" ? index.find((e) => e.id === dialog.id) ?? null : null}
        folders={folders}
        onClose={() => setDialog(null)}
        onMove={(id, folderId) => void setPicmonicFolder(id, folderId)}
      />
      <DeleteConfirm
        open={Boolean(folderDelete)}
        onOpenChange={(open) => !open && setFolderDelete(null)}
        title={folderDelete ? `Delete folder "${folderDelete.name}"?` : undefined}
        description="Child folders and Picmonics in this folder will move to the parent folder. Nothing is deleted except the folder itself."
        confirmLabel="Delete folder"
        onConfirm={onConfirmFolderDelete}
      />
    </div>
  );
}

function FolderTreeRoot({
  selected,
  onSelect,
  onDrop,
}: {
  selected: boolean;
  onSelect: () => void;
  onDrop: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn(
        "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selected ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <FolderOpenIcon className="size-4" />
      <span className="truncate">Library</span>
    </button>
  );
}

function UnfiledFolderRow({
  selected,
  count,
  onSelect,
  onDrop,
}: {
  selected: boolean;
  count: number;
  onSelect: () => void;
  onDrop: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn(
        "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selected ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <FolderIcon className="size-4" />
      <span className="min-w-0 flex-1 truncate">Unfiled</span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </button>
  );
}

function FolderTree({
  folders,
  parentId,
  selectedFolderId,
  expanded,
  dragging,
  onToggle,
  onSelect,
  onDragStart,
  onDrop,
  onCreate,
  onRename,
  onMove,
  onDelete,
  depth = 0,
}: {
  folders: readonly FolderNode[];
  parentId: string | null;
  selectedFolderId: string | null;
  expanded: ReadonlySet<string>;
  dragging: DragState;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onDragStart: (state: DragState) => void;
  onDrop: (id: string) => void;
  onCreate: (parentId: string) => void;
  onRename: (folder: FolderNode) => void;
  onMove: (folder: FolderNode) => void;
  onDelete: (folder: FolderNode) => void;
  depth?: number;
}) {
  const children = folders.filter((f) => f.parentId === parentId);
  return (
    <>
      {children.map((folder) => {
        const hasChildren = folders.some((f) => f.parentId === folder.id);
        const isOpen = expanded.has(folder.id);
        const selected = selectedFolderId === folder.id;
        const dropDisabled =
          dragging?.type === "folder" &&
          (dragging.id === folder.id || isFolderDescendant(folders, folder.id, dragging.id));
        return (
          <div key={folder.id}>
            <div
              draggable
              onDragStart={() => onDragStart({ type: "folder", id: folder.id })}
              onDragEnd={() => onDragStart(null)}
              onDragOver={(e) => {
                if (!dropDisabled) e.preventDefault();
              }}
              onDrop={() => !dropDisabled && onDrop(folder.id)}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1 transition-colors",
                selected ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                dropDisabled && "opacity-50",
              )}
              style={{ paddingLeft: 4 + depth * 12 }}
            >
              <button
                type="button"
                onClick={() => hasChildren && onToggle(folder.id)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground"
                aria-label={isOpen ? "Collapse folder" : "Expand folder"}
              >
                <ChevronRightIcon className={cn("size-3 transition-transform", isOpen && "rotate-90")} />
              </button>
              <button
                type="button"
                onClick={() => onSelect(folder.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"
              >
                <FolderIcon className="size-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
              <FolderMenu
                folder={folder}
                onCreate={() => onCreate(folder.id)}
                onRename={() => onRename(folder)}
                onMove={() => onMove(folder)}
                onDelete={() => onDelete(folder)}
              />
            </div>
            {isOpen ? (
              <FolderTree
                folders={folders}
                parentId={folder.id}
                selectedFolderId={selectedFolderId}
                expanded={expanded}
                dragging={dragging}
                onToggle={onToggle}
                onSelect={onSelect}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onCreate={onCreate}
                onRename={onRename}
                onMove={onMove}
                onDelete={onDelete}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function FolderMenu({
  folder,
  onCreate,
  onRename,
  onMove,
  onDelete,
}: {
  folder: FolderNode;
  onCreate: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Actions for ${folder.name}`}
            className="flex size-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus:opacity-100"
          >
            <MoreHorizontalIcon className="size-3.5" />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onCreate}>New subfolder</DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={onMove}>Move folder...</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Delete folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderTile({
  folder,
  count,
  onOpen,
  onDragStart,
  onDrop,
  onCreate,
  onRename,
  onMove,
  onDelete,
}: {
  folder: FolderNode;
  count: number;
  onOpen: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onCreate: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:border-foreground/30 hover:bg-card/70"
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground">
          <FolderIcon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{folder.name}</span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {count} Picmonic{count === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      <FolderMenu folder={folder} onCreate={onCreate} onRename={onRename} onMove={onMove} onDelete={onDelete} />
    </div>
  );
}

function VirtualFolderTile({
  name,
  count,
  onOpen,
  onDrop,
}: {
  name: string;
  count: number;
  onOpen: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:border-foreground/30 hover:bg-card/70"
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground">
          <FolderIcon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {count} Picmonic{count === 1 ? "" : "s"}
          </span>
        </span>
      </button>
    </div>
  );
}

function FolderNameDialog({
  state,
  folders,
  onClose,
  onCreate,
  onRename,
  onMove,
}: {
  state:
    | { type: "create"; parentId: string | null }
    | { type: "rename"; folder: FolderNode }
    | { type: "move"; folder: FolderNode }
    | null;
  folders: readonly FolderNode[];
  onClose: () => void;
  onCreate: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, parentId: string | null) => boolean;
}) {
  if (!state) return null;
  return (
    <FolderNameDialogInner
      key={state.type === "create" ? `create:${state.parentId ?? "root"}` : `${state.type}:${state.folder.id}`}
      state={state}
      folders={folders}
      onClose={onClose}
      onCreate={onCreate}
      onRename={onRename}
      onMove={onMove}
    />
  );
}

function FolderNameDialogInner({
  state,
  folders,
  onClose,
  onCreate,
  onRename,
  onMove,
}: {
  state:
    | { type: "create"; parentId: string | null }
    | { type: "rename"; folder: FolderNode }
    | { type: "move"; folder: FolderNode };
  folders: readonly FolderNode[];
  onClose: () => void;
  onCreate: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, parentId: string | null) => boolean;
}) {
  const [name, setName] = React.useState(
    state.type === "rename" ? state.folder.name : "",
  );
  const [parentId, setParentId] = React.useState<string | null>(
    state.type === "move"
      ? state.folder.parentId ?? null
      : state.type === "create"
        ? state.parentId
        : null,
  );
  const moving = state.type === "move" ? state.folder : null;
  const title =
    state.type === "create"
      ? "New folder"
      : state.type === "rename"
        ? "Rename folder"
        : "Move folder";
  const save = () => {
    if (state.type === "create") onCreate(name.trim() || "New folder", state.parentId);
    else if (state.type === "rename") onRename(state.folder.id, name.trim());
    else onMove(state.folder.id, parentId);
    onClose();
  };
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {state.type === "move" ? (
            <DialogDescription>Choose the new parent folder.</DialogDescription>
          ) : null}
        </DialogHeader>
        {state.type === "move" ? (
          <FolderSelect folders={folders} value={parentId} movingFolder={moving} onChange={setParentId} />
        ) : (
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" autoFocus />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={state.type !== "move" && !name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovePicmonicDialog({
  entry,
  folders,
  onClose,
  onMove,
}: {
  entry: PicmonicIndexEntry | null;
  folders: readonly FolderNode[];
  onClose: () => void;
  onMove: (id: string, folderId: string | null) => void;
}) {
  if (!entry) return null;
  return (
    <MovePicmonicDialogInner
      key={entry.id}
      entry={entry}
      folders={folders}
      onClose={onClose}
      onMove={onMove}
    />
  );
}

function MovePicmonicDialogInner({
  entry,
  folders,
  onClose,
  onMove,
}: {
  entry: PicmonicIndexEntry;
  folders: readonly FolderNode[];
  onClose: () => void;
  onMove: (id: string, folderId: string | null) => void;
}) {
  const [folderId, setFolderId] = React.useState<string | null>(
    entry.folderId ?? null,
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move Picmonic</DialogTitle>
          <DialogDescription>
            Choose a folder for <span className="text-foreground">{entry.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <FolderSelect folders={folders} value={folderId} nullLabel="Unfiled" onChange={setFolderId} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (entry) onMove(entry.id, folderId);
              onClose();
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderSelect({
  folders,
  value,
  nullLabel = "Library",
  movingFolder,
  onChange,
}: {
  folders: readonly FolderNode[];
  value: string | null;
  nullLabel?: string;
  movingFolder?: FolderNode | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
    >
      <option value="">{nullLabel}</option>
      {folders.map((folder) => {
        const disabled =
          movingFolder &&
          (folder.id === movingFolder.id ||
            isFolderDescendant(folders, folder.id, movingFolder.id));
        return (
          <option key={folder.id} value={folder.id} disabled={disabled ?? false}>
            {folderPath(folders, folder.id).map((f) => f.name).join(" / ")}
          </option>
        );
      })}
    </select>
  );
}

function folderPath(folders: readonly FolderNode[], folderId: string | null): FolderNode[] {
  const out: FolderNode[] = [];
  let cur = folderId;
  while (cur) {
    const folder = folders.find((f) => f.id === cur);
    if (!folder) break;
    out.unshift(folder);
    cur = folder.parentId;
  }
  return out;
}
