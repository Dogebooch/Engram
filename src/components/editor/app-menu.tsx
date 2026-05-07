"use client";

// app-menu: version + check-for-updates dropdown
import * as React from "react";
import { InfoIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { checkForUpdates } from "@/lib/updater";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

export function AppMenu() {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="App menu"
                  className="text-muted-foreground/70"
                >
                  <InfoIcon />
                </Button>
              }
            />
          }
        />
        <TooltipContent>About / updates</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Engram v{APP_VERSION}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void checkForUpdates()}>
          <RefreshCwIcon />
          Check for updates&hellip;
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
