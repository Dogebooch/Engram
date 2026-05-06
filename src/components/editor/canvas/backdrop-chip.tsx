"use client";

import * as React from "react";
import {
  ImagePlusIcon,
  LayersIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  USER_ASSET_ACCEPT,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { pauseHistory, resumeHistory } from "@/lib/store/temporal";
import {
  useBlobPreviewUrl,
  type BackdropUploadResult,
} from "@/lib/user-assets";
import { cn } from "@/lib/utils";

interface BackdropChipProps {
  /** When true, the chip fades out + pointer-events:none so it doesn't fight a drag. */
  faded?: boolean;
}

export function BackdropChip({ faded = false }: BackdropChipProps) {
  const picmonic = usePicmonic();
  const setBackdropFromUpload = useStore((s) => s.setBackdropFromUpload);
  const clearBackdrop = useStore((s) => s.clearBackdrop);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const blobId = picmonic?.canvas.backdrop?.uploadedBlobId ?? null;
  const hasBackdrop = !!blobId;
  const previewUrl = useBlobPreviewUrl(blobId);

  // First-visit pulse: keyed off `sceneId` so React remounts the empty-state
  // button on scene switch, retriggering the CSS animation. The CSS uses
  // `animation` (not `animation-iteration-count: infinite`), so it runs to
  // completion and stops on its own. No state, no effect.
  const sceneId = picmonic?.id ?? null;

  // Close popover on Escape and on outside click.
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const handleTrigger = React.useCallback(() => {
    if (!picmonic) {
      toast.error("Create a Picmonic first", {
        description: "⌘/Ctrl+N or the + button up top.",
      });
      return;
    }
    if (hasBackdrop) {
      setOpen((v) => !v);
    } else {
      fileInputRef.current?.click();
    }
  }, [picmonic, hasBackdrop]);

  const handlePickFile = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const reportResult = React.useCallback(
    (result: BackdropUploadResult, isReplace: boolean) => {
      if (result.kind === "ok") {
        toast.success(isReplace ? "Background replaced" : "Background set", {
          description: result.asset?.displayName,
        });
      } else {
        toast.error("Couldn't set background", {
          description: rejectMessage(result.reason),
        });
      }
    },
    [],
  );

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
    setOpen(false);
  }, [clearBackdrop]);

  const setBackdropOpacity = useStore((s) => s.setBackdropOpacity);
  const setLibrarySegment = useStore((s) => s.setLibrarySegment);
  const setHighlightAssetId = useStore((s) => s.setHighlightAssetId);
  const setLeftCollapsed = useStore((s) => s.setLeftCollapsed);

  // Live opacity edits stream immediately for visual feedback, but push
  // exactly one history entry per drag (pre-drag value → final value).
  // Pattern (verbatim from the legacy BackdropCard):
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
      resumeHistory();
      return;
    }
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

  const opacity = picmonic?.canvas.backdrop?.opacity ?? 1;
  const opacityPct = Math.round(opacity * 100);

  const handleOpenInLibrary = React.useCallback(() => {
    if (!blobId) return;
    setLeftCollapsed(false);
    setLibrarySegment("backgrounds");
    setHighlightAssetId(blobId);
    setOpen(false);
  }, [blobId, setLeftCollapsed, setLibrarySegment, setHighlightAssetId]);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-3 top-3 z-10",
        "transition-opacity duration-200",
        faded && "pointer-events-none opacity-25",
      )}
    >
      {hasBackdrop ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTrigger}
          aria-label={`Background — ${opacityPct}% opacity`}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5",
            "border border-border/70 bg-card/70 backdrop-blur-md",
            "shadow-[0_2px_12px_rgba(0,0,0,0.25)]",
            "transition-colors duration-150",
            "hover:border-[var(--accent)]/40 hover:bg-card/85",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
          )}
        >
          <span
            className={cn(
              "size-6 overflow-hidden rounded-sm ring-1 ring-border/60",
              "bg-muted/40",
            )}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="size-full object-cover"
                draggable={false}
              />
            ) : null}
          </span>
          <span className="font-mono text-[10px] tabular-nums tracking-[0.12em] text-muted-foreground">
            {opacityPct}%
          </span>
        </button>
      ) : (
        <button
          key={sceneId ?? "no-scene"}
          ref={triggerRef}
          type="button"
          onClick={handleTrigger}
          disabled={busy}
          aria-label="Add background"
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5",
            "border border-dashed border-border/80 bg-card/40 backdrop-blur-md",
            "text-muted-foreground transition-colors",
            "hover:border-[var(--accent)]/60 hover:bg-card/60 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
            "disabled:opacity-50",
            sceneId && "engram-bg-pulse",
          )}
        >
          <ImagePlusIcon className="size-3.5" />
          <span className="text-[10px] font-medium uppercase tracking-[0.18em]">
            Background
          </span>
        </button>
      )}

      {open && hasBackdrop && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Background controls"
          className={cn(
            "absolute left-0 top-[calc(100%+6px)] z-20 w-60",
            "rounded-md border border-border/70 bg-card/95 p-3",
            "shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur-md",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Background
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/80">
              {opacityPct}%
            </span>
          </div>
          <div className="mb-2 aspect-video overflow-hidden rounded-sm bg-muted/30 ring-1 ring-border/60">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
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
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <PopoverButton
              onClick={handlePickFile}
              disabled={busy}
              icon={<RefreshCwIcon className="size-3" />}
              label="Replace"
            />
            <PopoverButton
              onClick={handleOpenInLibrary}
              icon={<LayersIcon className="size-3" />}
              label="Library"
            />
            <PopoverButton
              onClick={handleRemove}
              disabled={busy}
              icon={<Trash2Icon className="size-3" />}
              label="Remove"
              destructive
            />
          </div>
        </div>
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

function PopoverButton({
  onClick,
  disabled,
  icon,
  label,
  destructive,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5",
        "text-[9px] font-medium uppercase tracking-[0.12em]",
        "border border-border/70 bg-card/50 text-muted-foreground",
        "transition-colors hover:bg-white/[0.04] hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
        "disabled:opacity-50 disabled:pointer-events-none",
        destructive &&
          "hover:border-destructive/40 hover:bg-destructive/[0.06] hover:text-destructive",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
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
