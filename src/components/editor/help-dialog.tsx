"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { APP_VERSION } from "@/lib/app-version";

interface ShortcutRow {
  label: string;
  hint?: string;
  /** Each entry is one chip; if length > 1 they render with `+` separators. */
  keys: string[];
}

interface ShortcutSection {
  name: string;
  rows: ShortcutRow[];
}

const SECTIONS: ShortcutSection[] = [
  {
    name: "Editor",
    rows: [
      { label: "New Picmonic", keys: ["⌘", "N"] },
      { label: "Toggle library", keys: ["⌘", "B"] },
      { label: "Toggle notes", keys: ["⌘", "\\"] },
      { label: "Focus library search", keys: ["/"] },
      { label: "Show this help", keys: ["?"] },
    ],
  },
  {
    name: "Canvas & symbols",
    rows: [
      { label: "Select", hint: "click symbol", keys: [] },
      { label: "Multi-select", hint: "shift+click", keys: [] },
      { label: "Select all", keys: ["⌘", "A"] },
      { label: "Bypass group", hint: "alt+click", keys: [] },
      { label: "Tag with Fact", hint: "select first", keys: ["F"] },
      { label: "Right-click", hint: "context menu", keys: [] },
      { label: "Drag onto ## heading", hint: "drag-tag", keys: [] },
      { label: "Group selection", keys: ["⌘", "G"] },
      { label: "Ungroup", keys: ["⇧⌘", "G"] },
      { label: "Delete", keys: ["Del"] },
      { label: "Duplicate", keys: ["⌘", "D"] },
      { label: "Send back / forward", keys: ["[", "]"] },
      { label: "To back / front", keys: ["{", "}"] },
    ],
  },
  {
    name: "Player",
    rows: [
      { label: "Enter / cycle mode", keys: ["M"] },
      { label: "Prev / next fact", hint: "sequential mode", keys: ["←", "→"] },
      { label: "Jump to fact N", hint: "1–9", keys: ["1", "9"] },
      { label: "Exit", keys: ["Esc"] },
    ],
  },
  {
    name: "Picmonic",
    rows: [
      { label: "Save", hint: "auto-saves on edit", keys: ["⌘", "S"] },
      { label: "Back to home", hint: "click brand", keys: [] },
      { label: "Esc ladder", hint: "picker → menu → clear", keys: ["Esc"] },
    ],
  },
];

export function HelpDialog() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);

  // Conditionally render so base-ui fully unmounts on close (otherwise the
  // popup lingers in DOM with data-closed but opacity 1 — exit animation has
  // no fill-mode forwards).
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-lg gap-0 p-0"
        aria-describedby={undefined}
      >
        <ManpageStamp />

        <DialogPrimitive.Title className="sr-only">
          Keyboard shortcuts
        </DialogPrimitive.Title>

        <div className="max-h-[68vh] overflow-y-auto px-5 pt-2 pb-4">
          {SECTIONS.map((section, idx) => (
            <Section key={section.name} section={section} first={idx === 0} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManpageStamp() {
  return (
    <div className="flex items-center justify-center gap-2 px-5 pt-4 pb-3 text-[10px] uppercase tracking-[0.2em] font-mono text-muted-foreground/55">
      <span>engram(1)</span>
      <span className="text-muted-foreground/35">•</span>
      <span>v{APP_VERSION}</span>
      <span className="text-muted-foreground/35">•</span>
      <span>keyboard</span>
    </div>
  );
}

function Section({ section, first }: { section: ShortcutSection; first: boolean }) {
  return (
    <section className={cn("pb-2", first ? "" : "pt-4 mt-2 border-t border-dotted border-border/50")}>
      <SectionHeading name={section.name} />
      <div className="mt-3 flex flex-col gap-1.5">
        {section.rows.map((row, i) => (
          <Row key={`${section.name}-${i}`} row={row} />
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ name }: { name: string }) {
  return (
    <div className="relative inline-flex items-center gap-2 pb-1.5 pr-3 border-b border-dotted border-accent/25">
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

function Row({ row }: { row: ShortcutRow }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="truncate font-mono text-[13px] text-foreground/85">
          {row.label}
        </span>
        {row.hint ? (
          <span className="hidden sm:inline truncate font-mono text-[11px] text-muted-foreground/55">
            — {row.hint}
          </span>
        ) : null}
      </div>
      {row.keys.length > 0 ? (
        <KeyGroup keys={row.keys} />
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground/45">—</span>
      )}
    </div>
  );
}

function KeyGroup({ keys }: { keys: string[] }) {
  return (
    <div className="shrink-0 flex items-center gap-1">
      {keys.map((k, i) => (
        <React.Fragment key={`${k}-${i}`}>
          {i > 0 ? (
            <span aria-hidden className="font-mono text-[10px] text-muted-foreground/35">
              +
            </span>
          ) : null}
          <Kbd>{k}</Kbd>
        </React.Fragment>
      ))}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center px-1.5",
        "rounded-[3px] border border-border/55 bg-card/70",
        "font-mono text-[11px] font-medium text-foreground/85",
        "shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]",
      )}
    >
      {children}
    </kbd>
  );
}
