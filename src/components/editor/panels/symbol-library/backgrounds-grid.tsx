"use client";

import * as React from "react";
import { ImageOffIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import {
  deleteBackgroundAsset,
  getUserAssetBlobUrl,
  renameBackgroundAsset,
  type UserAsset,
} from "@/lib/user-assets";
import { cn } from "@/lib/utils";

interface BackgroundsGridProps {
  /** Already filtered to kind === "background", ordered newest-first. */
  assets: UserAsset[];
  query: string;
}

export function BackgroundsGrid({ assets, query }: BackgroundsGridProps) {
  const setBackdropFromAsset = useStore((s) => s.setBackdropFromAsset);
  const clearBackdrop = useStore((s) => s.clearBackdrop);
  const picmonic = usePicmonic();
  const activeId = picmonic?.canvas.backdrop?.uploadedBlobId ?? null;

  const highlightAssetId = useStore((s) => s.ui.highlightAssetId);
  const setHighlightAssetId = useStore((s) => s.setHighlightAssetId);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      if (a.displayName.toLowerCase().includes(q)) return true;
      if (a.originalFilename.toLowerCase().includes(q)) return true;
      return a.tags.some((t) => t.toLowerCase().includes(q));
    });
  }, [assets, query]);

  const apply = React.useCallback(
    (asset: UserAsset) => {
      if (!picmonic) {
        toast.error("Create a Picmonic first", {
          description: "⌘/Ctrl+N or the + button up top.",
        });
        return;
      }
      const ok = setBackdropFromAsset(asset.id);
      if (ok) {
        toast.success("Background applied", {
          description: asset.displayName,
        });
      }
    },
    [picmonic, setBackdropFromAsset],
  );

  const handleRename = React.useCallback(async (asset: UserAsset) => {
    const next = window.prompt("Rename background", asset.displayName);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === asset.displayName) return;
    await renameBackgroundAsset(asset.id, trimmed);
  }, []);

  const handleDelete = React.useCallback(
    async (asset: UserAsset) => {
      const ok = window.confirm(
        `Delete background "${asset.displayName}"?\n\nThis removes it from the library. Any scene currently using it will lose its background.`,
      );
      if (!ok) return;
      // If this background is on the current scene, clear the reference
      // first so we don't leave a dangling uploadedBlobId.
      if (activeId === asset.id) clearBackdrop();
      await deleteBackgroundAsset(asset.id);
      toast.success("Background deleted");
    },
    [activeId, clearBackdrop],
  );

  if (assets.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <ImageOffIcon className="size-6 text-muted-foreground/40" />
        <div className="space-y-1">
          <p className="text-[12px] text-muted-foreground">
            No backgrounds yet
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            Drop an image on the canvas or use the chip in the top-left to add
            one.
          </p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
        <p className="text-[11px] text-muted-foreground/70">
          No backgrounds match{" "}
          <span className="text-foreground">&ldquo;{query}&rdquo;</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="grid grid-cols-2 gap-2 overflow-y-auto px-2 py-2">
        {filtered.map((asset) => (
          <BackgroundTile
            key={asset.id}
            asset={asset}
            isActive={asset.id === activeId}
            isHighlighted={asset.id === highlightAssetId}
            onConsumeHighlight={() => setHighlightAssetId(null)}
            onApply={() => apply(asset)}
            onRename={() => handleRename(asset)}
            onDelete={() => handleDelete(asset)}
          />
        ))}
      </div>
      <BackgroundsFooter />
    </div>
  );
}

interface TileProps {
  asset: UserAsset;
  isActive: boolean;
  isHighlighted: boolean;
  onConsumeHighlight: () => void;
  onApply: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function BackgroundTile({
  asset,
  isActive,
  isHighlighted,
  onConsumeHighlight,
  onApply,
  onRename,
  onDelete,
}: TileProps) {
  const url = getUserAssetBlobUrl(asset.id) ?? null;
  const tileRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!isHighlighted) return;
    tileRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = window.setTimeout(onConsumeHighlight, 1600);
    return () => window.clearTimeout(t);
  }, [isHighlighted, onConsumeHighlight]);

  return (
    <div className="group relative">
      <button
        ref={tileRef}
        type="button"
        onClick={onApply}
        title={asset.displayName}
        className={cn(
          "relative block aspect-video w-full overflow-hidden rounded-md",
          "border bg-muted/20 transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
          isActive
            ? "border-[var(--accent)]/70 ring-1 ring-[var(--accent)]/40"
            : "border-border/60 hover:border-[var(--accent)]/50",
          isHighlighted && "animate-pulse-once",
        )}
        style={
          isHighlighted
            ? { boxShadow: "0 0 0 2px var(--accent)" }
            : undefined
        }
      >
        {url ? (
          <img
            src={url}
            alt={asset.displayName}
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground/40">
            …
          </div>
        )}
        {isActive && (
          <span
            aria-label="Currently applied"
            className="absolute left-1 top-1 rounded-sm bg-[var(--accent)]/90 px-1 py-px font-mono text-[8px] uppercase tracking-[0.18em] text-background"
          >
            On scene
          </span>
        )}
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/95 to-transparent",
            "px-1.5 py-1 text-left text-[10px] font-medium text-foreground/90",
          )}
        >
          {asset.displayName}
        </span>
      </button>
      <div
        className={cn(
          "pointer-events-none absolute right-1 top-1 flex gap-1",
          "opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100",
          "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        )}
      >
        <TileIconButton label="Rename" onClick={onRename}>
          <PencilIcon className="size-3" />
        </TileIconButton>
        <TileIconButton label="Delete" onClick={onDelete} destructive>
          <Trash2Icon className="size-3" />
        </TileIconButton>
      </div>
    </div>
  );
}

function TileIconButton({
  children,
  label,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "flex size-5 items-center justify-center rounded-sm",
        "border border-border/70 bg-background/80 backdrop-blur-sm",
        "text-muted-foreground transition-colors",
        "hover:bg-background hover:text-foreground",
        destructive && "hover:border-destructive/60 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function BackgroundsFooter() {
  return (
    <div className="border-t border-border/40 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50">
        Free sources
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
        Polyhaven (CC0) · Wikimedia Commons · Met Open Access · Pixabay
      </p>
    </div>
  );
}
