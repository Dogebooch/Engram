"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SymbolLibrary } from "./index";

/**
 * Slide-over housing the stock-symbol library. Opened via the editor rail, the
 * "+ symbol" Fact affordance, or the focus-search shortcut. The modal variant
 * closes on backdrop click / Esc; the rail variant stays non-modal so the rail
 * can remain the persistent toggle.
 *
 * The Sheet is controlled by `libraryDrawerOpen` (so the keyboard/notes
 * openers work) AND wraps the trigger element passed as `children` — using a
 * real Base UI trigger avoids the "open then the same click dismisses it"
 * race that a plain onClick on an external button would hit.
 */
export function SymbolLibraryDrawer({
  children,
  modal = true,
}: {
  children?: React.ReactElement;
  modal?: boolean | "trap-focus";
}) {
  const open = useStore((s) => s.libraryDrawerOpen);
  const setOpen = useStore((s) => s.setLibraryDrawerOpen);
  const clearImageTarget = useStore((s) => s.clearImageTarget);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      // Closing without a pick: drop a pending image-assign target so it can't
      // leak into a later normal add.
      if (!next) clearImageTarget();
      setOpen(next);
    },
    [clearImageTarget, setOpen],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} modal={modal}>
      {children ? <SheetTrigger render={children} /> : null}
      <SheetContent
        side="left"
        showCloseButton={false}
        showBackdrop={modal === true}
        className={cn(
          "p-0",
          modal === false &&
            "left-11 top-12! h-[calc(100%-3rem)]! shadow-lg",
        )}
      >
        <SheetTitle className="sr-only">Symbol library</SheetTitle>
        <div className="flex h-full min-h-0 flex-col">
          <SymbolLibrary />
        </div>
      </SheetContent>
    </Sheet>
  );
}
