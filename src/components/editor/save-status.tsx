"use client";

import { CheckIcon, CircleDashedIcon, Loader2Icon, OctagonXIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSaveStatus, useCurrentPicmonicId } from "@/lib/store/hooks";

const COPY = {
  idle: "Saved",
  saving: "Saving",
  saved: "Saved",
  error: "Save failed",
} as const;

export function SaveStatus() {
  const status = useSaveStatus();
  const id = useCurrentPicmonicId();

  if (!id) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums transition-colors",
        status === "saving" && "border-accent/40 text-accent",
        status === "saved" && "text-[color:var(--success)]",
        status === "error" && "border-destructive/40 text-destructive",
        status === "idle" && "text-muted-foreground/70",
      )}
    >
      <Icon status={status} />
      <span>{COPY[status]}</span>
    </div>
  );
}

function Icon({ status }: { status: ReturnType<typeof useSaveStatus> }) {
  switch (status) {
    case "saving":
      return <Loader2Icon className="size-3 animate-spin" />;
    case "saved":
      return <CheckIcon className="size-3" />;
    case "error":
      return <OctagonXIcon className="size-3" />;
    case "idle":
    default:
      return <CircleDashedIcon className="size-3" />;
  }
}
