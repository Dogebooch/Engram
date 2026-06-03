"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SymbolLibrary } from "./index";

/**
 * Slide-over housing the stock-symbol library. Demoted from a permanent left
 * pane: opened via the topbar "Insert symbol" trigger, the "+ symbol" Fact
 * affordance, or the focus-search shortcut. Closes on backdrop click / Esc.
 *
 * The Sheet is controlled by `libraryDrawerOpen` (so the keyboard/notes
 * openers work) AND wraps the trigger element passed as `children` — using a
 * real Base UI trigger avoids the "open then the same click dismisses it"
 * race that a plain onClick on an external button would hit.
 */
export function SymbolLibraryDrawer({
  children,
}: {
  children?: React.ReactElement;
}) {
  const open = useStore((s) => s.libraryDrawerOpen);
  const setOpen = useStore((s) => s.setLibraryDrawerOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {children ? <SheetTrigger render={children} /> : null}
      <SheetContent side="left" showCloseButton={false} className="p-0">
        <SheetTitle className="sr-only">Symbol library</SheetTitle>
        <div className="flex h-full min-h-0 flex-col">
          <SymbolLibrary />
        </div>
      </SheetContent>
    </Sheet>
  );
}
