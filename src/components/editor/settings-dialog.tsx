"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  CircleHelpIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCwIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { useUiPrefs } from "@/lib/store/hooks";
import { checkForUpdates } from "@/lib/updater";
import { cn } from "@/lib/utils";
import type { PlayerMode } from "@/lib/store/slices/ui-slice";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

type SectionKey = "general" | "appearance" | "about";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "appearance", label: "Appearance" },
  { key: "about", label: "About" },
];

const subscribeNoop = () => () => {};

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const [active, setActive] = React.useState<SectionKey>("general");

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-3xl gap-0 p-0 overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogPrimitive.Title className="sr-only">
          Settings
        </DialogPrimitive.Title>

        <div className="flex h-[min(72vh,640px)]">
          <NavRail active={active} onSelect={setActive} />
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {active === "general" ? <GeneralSection /> : null}
            {active === "appearance" ? <AppearanceSection /> : null}
            {active === "about" ? <AboutSection /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NavRail({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="w-[180px] shrink-0 border-r border-border/50 bg-muted/20 px-2 py-4"
    >
      <div className="px-2 pb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/55">
        Settings
      </div>
      <ul className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => {
          const isActive = s.key === active;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
                  isActive
                    ? "text-foreground/90 bg-card/70"
                    : "text-muted-foreground/70 hover:text-foreground/85 hover:bg-card/40",
                )}
              >
                <span aria-hidden className={isActive ? "text-accent/85" : "text-transparent"}>
                  ▍
                </span>
                <span className="ml-1.5">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SectionHeading({ name }: { name: string }) {
  return (
    <div className="relative inline-flex items-center gap-2 pb-1.5 pr-3 mb-4 border-b border-dotted border-accent/25">
      <AccentDot />
      <span aria-hidden className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/75">
        <span className="text-accent/85">▍</span>
        <span className="ml-1.5">{name}</span>
      </span>
    </div>
  );
}

function AccentDot() {
  return (
    <span aria-hidden className="relative inline-flex size-2 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-accent/30 blur-[2px]" />
      <span className="relative size-1 rounded-full bg-accent" />
    </span>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-border/30 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[13px] text-foreground/85">{label}</div>
        {description ? (
          <div className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground/60">
            {description}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 flex items-center gap-2 pt-0.5">{children}</div>
    </div>
  );
}

function SegmentedRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; Icon?: typeof SunIcon }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/55 bg-card/40 p-0.5">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-[4px] font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
              isActive
                ? "bg-card text-foreground/90 ring-1 ring-foreground/10"
                : "text-muted-foreground/70 hover:text-foreground/85",
            )}
          >
            {opt.Icon ? <opt.Icon className="size-3.5" aria-hidden /> : null}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function GeneralSection() {
  const ui = useUiPrefs();
  const setConfirmSymbolDelete = useStore((s) => s.setConfirmSymbolDelete);
  const setLastPlayerMode = useStore((s) => s.setLastPlayerMode);

  return (
    <section>
      <SectionHeading name="General" />
      <SettingRow
        label="Confirm before deleting symbols"
        description="Show a confirmation dialog when deleting symbols from the canvas."
      >
        <Checkbox
          checked={ui.confirmSymbolDelete}
          onCheckedChange={(v) => setConfirmSymbolDelete(Boolean(v))}
          aria-label="Confirm before deleting symbols"
        />
      </SettingRow>
      <SettingRow
        label="Default study mode"
        description="Which display mode the player opens in. Cycle modes inside the player with M."
      >
        <SegmentedRow<PlayerMode>
          value={ui.lastPlayerMode}
          options={[
            { value: "hotspot", label: "Hotspot" },
            { value: "sequential", label: "Sequential" },
          ]}
          onChange={setLastPlayerMode}
        />
      </SettingRow>
    </section>
  );
}

type ThemeOption = "light" | "dark" | "system";

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const active: ThemeOption = mounted ? ((theme as ThemeOption) ?? "system") : "system";

  return (
    <section>
      <SectionHeading name="Appearance" />
      <SettingRow
        label="Theme"
        description="Light or dark color scheme. System follows your OS preference."
      >
        <SegmentedRow<ThemeOption>
          value={active}
          options={[
            { value: "light", label: "Light", Icon: SunIcon },
            { value: "dark", label: "Dark", Icon: MoonIcon },
            { value: "system", label: "System", Icon: MonitorIcon },
          ]}
          onChange={(v) => setTheme(v)}
        />
      </SettingRow>
    </section>
  );
}

function AboutSection() {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

  return (
    <section>
      <SectionHeading name="About" />
      <SettingRow
        label="Version"
        description="Engram is a single-user, local-only mnemonic editor."
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          v{APP_VERSION}
        </span>
      </SettingRow>
      <SettingRow
        label="Updates"
        description="Check for a newer release. Auto-update is available in the desktop build."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void checkForUpdates()}
        >
          <RefreshCwIcon />
          Check for updates
        </Button>
      </SettingRow>
      <SettingRow
        label="Keyboard shortcuts"
        description="Open the full reference. Or press ? at any time."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSettingsOpen(false);
            setHelpOpen(true);
          }}
        >
          <CircleHelpIcon />
          View shortcuts
        </Button>
      </SettingRow>
    </section>
  );
}
