"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CircleDashedIcon, Loader2Icon, OctagonXIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSaveStatus,
  useCurrentPicmonicId,
  useLastSavedAt,
} from "@/lib/store/hooks";

const COPY = {
  saving: "Saving",
  saved: "Saved",
  error: "Save failed",
} as const;

const TIME_FMT = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function SaveStatus() {
  const status = useSaveStatus();
  const id = useCurrentPicmonicId();
  const lastSavedAt = useLastSavedAt();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (status !== "idle" || lastSavedAt == null) return;
    const interval = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(interval);
  }, [status, lastSavedAt]);

  if (!id) return null;

  const idleLabel =
    lastSavedAt != null ? `Saved (${TIME_FMT.format(lastSavedAt)})` : "Idle";

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
      <span>{status === "idle" ? idleLabel : COPY[status]}</span>
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
