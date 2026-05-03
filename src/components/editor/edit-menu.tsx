"use client";

import { ChevronDownIcon, PencilIcon, RedoIcon, UndoIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUndoRedo } from "@/lib/store/temporal";

const META_KEY =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

const SHIFT_KEY =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
    ? "⇧"
    : "Shift";

export function EditMenu() {
  const { canUndo, canRedo, undo, redo } = useUndoRedo();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Edit menu"
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4"
      >
        <PencilIcon />
        <span>Edit</span>
        <ChevronDownIcon className="-ml-0.5 size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Edit
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuItem onClick={undo} disabled={!canUndo}>
          <UndoIcon />
          Undo
          <DropdownMenuShortcut>{META_KEY}+Z</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={redo} disabled={!canRedo}>
          <RedoIcon />
          Redo
          <DropdownMenuShortcut>
            {META_KEY}+{SHIFT_KEY}+Z
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
