"use client";

// app-menu: overflow for low-frequency chrome — version, keyboard shortcuts,
// theme, and check-for-updates. Demoted here from the topbar so the bar reads
// as a few primary verbs rather than a row of equal-weight icons.
import * as React from "react";
import {
  KeyboardIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCwIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import { checkForUpdates } from "@/lib/updater";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

type ThemeOption = "light" | "dark" | "system";

const subscribeNoop = () => () => {};

const THEME_OPTIONS: { value: ThemeOption; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

export function AppMenu() {
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const { theme, setTheme } = useTheme();
  // next-themes only resolves on the client; gating with useSyncExternalStore
  // gives a stable SSR snapshot without a set-state-in-effect cascade.
  const mounted = React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const activeTheme: ThemeOption = mounted ? ((theme as ThemeOption) ?? "system") : "dark";

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
                  aria-label="Menu"
                  className="text-muted-foreground/70"
                >
                  <MenuIcon />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Menu · theme · shortcuts</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Engram v{APP_VERSION}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setHelpOpen(true)}>
          <KeyboardIcon />
          Keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={activeTheme}
          onValueChange={(v) => setTheme(v as ThemeOption)}
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2 pl-1.5 pr-8">
              <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>{label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void checkForUpdates()}>
          <RefreshCwIcon />
          Check for updates&hellip;
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
