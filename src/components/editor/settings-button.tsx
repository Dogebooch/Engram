"use client";

import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";

export function SettingsButton() {
  const playerOpen = useStore((s) => s.player.open);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  if (playerOpen) return null;

  return (
    <div className="fixed bottom-3 left-3 z-20">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Settings"
              className="text-muted-foreground/70 bg-card/40 backdrop-blur ring-1 ring-foreground/5 supports-[backdrop-filter]:bg-card/30"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon />
            </Button>
          }
        />
        <TooltipContent side="right">Settings</TooltipContent>
      </Tooltip>
    </div>
  );
}
