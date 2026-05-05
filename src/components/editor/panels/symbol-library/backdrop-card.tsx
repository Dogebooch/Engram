"use client";

import * as React from "react";
import { ImagePlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  USER_ASSET_ACCEPT,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { pauseHistory, resumeHistory } from "@/lib/store/temporal";
import {
  getBlob,
  type BackdropUploadResult,
} from "@/lib/user-assets";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function BackdropCard() {
  const picmonic = usePicmonic();
  const backdrop = picmonic?.canvas.backdrop ?? null;
  const setBackdropFromUpload = useStore((s) => s.setBackdropFromUpload);
  const clearBackdrop = useStore((s) => s.clearBackdrop);
  const setBackdropOpacity = useStore((s) => s.setBackdropOpacity);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const hasBackdrop = !!backdrop?.uploadedBlobId;

  const previewUrl = useBackdropPreviewUrl(backdrop?.uploadedBlobId ?? null);

  const reportResult = React.useCallback(
    (result: BackdropUploadResult, isReplace: boolean) => {
      if (result.kind === "ok") {
        toast.success(isReplace ? "Background replaced" : "Background set");
      } else if (result.kind === "rejected") {
        toast.error("Couldn't set background", {
          description: rejectMessage(result.reason),
        });
      }
    },
    [],
  );

  const handlePick = React.useCallback(() => {
    if (!picmonic) {
      toast.error("Create a Picmonic first", {
        description: "⌘/Ctrl+N or the + button up top.",
      });
      return;
    }
    fileInputRef.current?.click();
  }, [picmonic]);

  const handleChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      const file = list[0];
      e.target.value = "";
      setBusy(true);
      try {
        const result = await setBackdropFromUpload(file);
        reportResult(result, hasBackdrop);
      } finally {
        setBusy(false);
      }
    },
    [setBackdropFromUpload, reportResult, hasBackdrop],
  );

  const handleRemove = React.useCallback(() => {
    clearBackdrop();
  }, [clearBackdrop]);

  // Live opacity edits stream immediately for visual feedback, but push
  // exactly one history entry per drag (pre-drag value → final value).
  // Pattern:
  //   - first input → capture pre-drag, pause history
  //   - subsequent inputs → just mutate visually
  //   - commit → restore to pre-drag (still paused, so no snapshot), resume,
  //     then write final value (a single state change → a single snapshot
  //     of the pre-drag state pushed onto pastStates).
  const dragRef = React.useRef<{ preDrag: number } | null>(null);
  const handleOpacityInput = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!dragRef.current) {
        const cur = useStore
          .getState()
          .picmonics[useStore.getState().currentPicmonicId ?? ""]?.canvas
          .backdrop?.opacity;
        dragRef.current = { preDrag: typeof cur === "number" ? cur : 1 };
        pauseHistory();
      }
      const next = Number(e.target.value) / 100;
      setBackdropOpacity(next);
    },
    [setBackdropOpacity],
  );
  const handleOpacityCommit = React.useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const cid = useStore.getState().currentPicmonicId;
    const final =
      cid != null
        ? (useStore.getState().picmonics[cid]?.canvas.backdrop?.opacity ?? 1)
        : 1;
    if (final === drag.preDrag) {
      // No net change — drop the paused state without polluting history.
      resumeHistory();
      return;
    }
    // Snap state back to pre-drag (still paused → no snapshot), then resume
    // and write final once. zundo pushes the pre-drag value as the past
    // entry; current ends at final.
    setBackdropOpacity(drag.preDrag);
    resumeHistory();
    setBackdropOpacity(final);
  }, [setBackdropOpacity]);

  React.useEffect(() => {
    return () => {
      if (dragRef.current) {
        dragRef.current = null;
        resumeHistory();
      }
    };
  }, []);

  const opacityPct = Math.round((backdrop?.opacity ?? 1) * 100);

  return (
    <div className="border-b border-border bg-card/60 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Background
        </span>
        {hasBackdrop && (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {opacityPct}%
          </span>
        )}
      </div>

      {hasBackdrop ? (
        <div className="space-y-2">
          <div className="relative aspect-video overflow-hidden rounded-md bg-muted/30 ring-1 ring-border/60">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Background preview"
                className="size-full object-cover"
                draggable={false}
              />
            ) : null}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacityPct}
            onChange={handleOpacityInput}
            onMouseUp={handleOpacityCommit}
            onTouchEnd={handleOpacityCommit}
            onKeyUp={handleOpacityCommit}
            aria-label={`Background opacity ${opacityPct}%`}
            className={cn(
              "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted/50",
              "accent-[var(--accent)]",
              "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]",
              "[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab",
              "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-[var(--accent)] [&::-moz-range-thumb]:border-0",
            )}
          />
          <div className="flex items-center gap-1.5">
            <ActionButton
              onClick={handlePick}
              disabled={busy}
              icon={<RefreshCwIcon className="size-3" />}
              label="Replace"
              tooltip="Replace background"
            />
            <ActionButton
              onClick={handleRemove}
              disabled={busy}
              icon={<Trash2Icon className="size-3" />}
              label="Remove"
              tooltip="Remove background"
              destructive
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePick}
          disabled={busy}
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-1.5",
            "aspect-video rounded-md border border-dashed border-border/80",
            "bg-card/30 text-muted-foreground transition-all",
            "hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/[0.04] hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
            "disabled:opacity-50",
          )}
          aria-label="Add background"
        >
          <ImagePlusIcon className="size-4 transition-transform group-hover:scale-110" />
          <span className="text-[11px] font-medium">Add background</span>
          <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50">
            Or drop on canvas
          </span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={USER_ASSET_ACCEPT}
        onChange={handleChange}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  destructive?: boolean;
}

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  tooltip,
  destructive,
}: ActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5",
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              "border border-border/70 bg-card/50 text-muted-foreground",
              "transition-colors hover:bg-white/[0.04] hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
              "disabled:opacity-50 disabled:pointer-events-none",
              destructive &&
                "hover:border-destructive/40 hover:bg-destructive/[0.06] hover:text-destructive",
            )}
          />
        }
      >
        {icon}
        <span>{label}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/** Resolve the backdrop blob into an object URL for the preview thumbnail. */
function useBackdropPreviewUrl(blobId: string | null): string | null {
  const [entry, setEntry] = React.useState<{
    blobId: string;
    url: string;
  } | null>(null);

  React.useEffect(() => {
    if (!blobId) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    void getBlob(blobId).then((blob) => {
      if (cancelled || !blob) return;
      createdUrl = URL.createObjectURL(blob);
      setEntry({ blobId, url: createdUrl });
    });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [blobId]);

  if (!entry || entry.blobId !== blobId) return null;
  return entry.url;
}

function rejectMessage(reason: string): string {
  switch (reason) {
    case "mime":
      return "Unsupported format. Use PNG, JPG, WebP, SVG, or GIF.";
    case "size":
      return `File exceeds ${(USER_ASSET_MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`;
    case "quota":
      return "Storage is nearly full. Delete unused Picmonics or uploads first.";
    case "empty":
      return "File is empty.";
    case "read-error":
      return "Could not read the file.";
    default:
      return reason;
  }
}
