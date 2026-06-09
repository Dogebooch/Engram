"use client";

import { ShapesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { SymbolLibraryDrawer } from "./panels/symbol-library/symbol-library-drawer";

export function EditorToolRail() {
  const libraryOpen = useStore((s) => s.libraryDrawerOpen);
  const setLibraryDrawerOpen = useStore((s) => s.setLibraryDrawerOpen);

  return (
    <aside className="flex w-11 shrink-0 flex-col items-center border-r border-border bg-card/30 py-2">
      <SymbolLibraryDrawer modal={false} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setLibraryDrawerOpen(!libraryOpen)}
              aria-label="Add symbol"
              aria-pressed={libraryOpen}
              className={cn(
                "text-muted-foreground/75",
                libraryOpen &&
                  "border-border bg-muted text-foreground shadow-sm hover:bg-muted",
              )}
            >
              <ShapesIcon />
            </Button>
          }
        />
        <TooltipContent side="right">Add symbol</TooltipContent>
      </Tooltip>
    </aside>
  );
}
