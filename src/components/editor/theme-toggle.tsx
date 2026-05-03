"use client";

import * as React from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ThemeOption = "light" | "dark" | "system";

const subscribeNoop = () => () => {};

const OPTIONS: { value: ThemeOption; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // next-themes only resolves on the client; gating with useSyncExternalStore
  // gives a stable SSR snapshot (returns false) without the cascading-render
  // pattern of useEffect+setState.
  const mounted = React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const active: ThemeOption = mounted ? ((theme as ThemeOption) ?? "system") : "dark";
  const indicatorTheme: "light" | "dark" =
    active === "system"
      ? ((resolvedTheme as "light" | "dark") ?? "dark")
      : active;
  const TriggerIcon =
    active === "system" ? MonitorIcon : indicatorTheme === "light" ? SunIcon : MoonIcon;

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
                  aria-label="Theme"
                  className="text-muted-foreground/70"
                >
                  <TriggerIcon
                    className="transition-transform duration-200"
                    aria-hidden="true"
                  />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[148px]">
        <DropdownMenuRadioGroup
          value={active}
          onValueChange={(v) => setTheme(v as ThemeOption)}
        >
          {OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className={cn("gap-2 pl-1.5 pr-8")}
            >
              <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>{label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
