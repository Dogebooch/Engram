"use client";

import { ArrowRightIcon, BrainIcon, FileTextIcon, ShapesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { APP_VERSION } from "@/lib/app-version";

const POINTS = [
  {
    icon: ShapesIcon,
    title: "Compose",
    body: "Drag symbols from the OpenMoji library onto a 16:9 stage. Tag any symbol with one or more Facts.",
  },
  {
    icon: FileTextIcon,
    title: "Annotate",
    body: "A markdown panel mirrors the canvas. Sections → Facts → Symbol bullets, Obsidian-friendly.",
  },
  {
    icon: BrainIcon,
    title: "Study",
    body: "Toggle player mode for numbered hotspots or sequential reveal. Export PNG, Markdown, Anki CSV.",
  },
] as const;

export function EmptyState() {
  const createPicmonic = useStore((s) => s.createPicmonic);

  return (
    <div className="flex h-full w-full items-center justify-center bg-stage p-10">
      <div className="relative flex w-full max-w-2xl flex-col items-start gap-8">
        <BackdropAccent />

        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            v{APP_VERSION}
          </span>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            Build your first mnemonic scene.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            engram is a local-first, Obsidian-native editor for Picmonic-style mnemonics.
            Nothing leaves your machine. Refresh-safe. Markdown is the source of truth.
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => createPicmonic()}
          className="group bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Create your first Picmonic
          <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
        </Button>

        <div className="grid w-full gap-4 sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-lg border border-border/60 bg-card/40 p-4 transition-colors hover:border-border hover:bg-card/70"
            >
              <div className="mb-3 flex size-7 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground transition-colors group-hover:text-accent">
                <Icon className="size-3.5" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/90">
                {title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BackdropAccent() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -left-32 -top-24 -z-10 size-72 rounded-full bg-accent/10 blur-3xl"
    />
  );
}
