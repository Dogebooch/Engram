"use client";

import * as React from "react";
import { ImageIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  deleteUserAsset,
  findPicmonicsUsingSymbol,
  getUserAssetBlobUrl,
  userAssetSymbolId,
  type UserAsset,
} from "@/lib/user-assets";
import { getSymbolById, type SymbolEntry } from "@/lib/symbols";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LibraryCard } from "./library-card";

interface UploadsSectionProps {
  assets: UserAsset[];
  onActivate: (entry: SymbolEntry) => void;
}

export function UploadsSection({ assets, onActivate }: UploadsSectionProps) {
  if (assets.length === 0) return null;
  return (
    <div className="border-b border-border/70 bg-card/30 px-2 pb-2 pt-2.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
          <ImageIcon className="size-2.5" />
          <span>My Uploads</span>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground/40">
          {assets.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {assets.map((asset) => (
          <UploadCard key={asset.id} asset={asset} onActivate={onActivate} />
        ))}
      </div>
    </div>
  );
}

interface UploadCardProps {
  asset: UserAsset;
  onActivate: (entry: SymbolEntry) => void;
}

function UploadCard({ asset, onActivate }: UploadCardProps) {
  const symbolId = userAssetSymbolId(asset.id);
  const entry = getSymbolById(symbolId);
  const fallbackUrl = getUserAssetBlobUrl(asset.id);
  const [busy, setBusy] = React.useState(false);

  const handleDelete = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (busy) return;
      setBusy(true);
      try {
        const usage = await findPicmonicsUsingSymbol(symbolId);
        if (usage.length > 0) {
          const names = usage.map((u) => `"${u.name}"`).join(", ");
          const confirmed = window.confirm(
            `"${asset.displayName}" is used in ${usage.length} Picmonic${
              usage.length === 1 ? "" : "s"
            }: ${names}.\n\nDelete anyway? Those Picmonics will show a broken-image placeholder.`,
          );
          if (!confirmed) {
            setBusy(false);
            return;
          }
        }
        await deleteUserAsset(asset.id);
        toast.success(`Deleted "${asset.displayName}"`);
      } catch (err) {
        console.error(err);
        toast.error("Could not delete upload");
      } finally {
        setBusy(false);
      }
    },
    [asset.id, asset.displayName, symbolId, busy],
  );

  if (entry) {
    return (
      <div className="group/upload relative">
        <LibraryCard entry={entry} size="small" onActivate={onActivate} />
        <DeleteOverlay onClick={handleDelete} />
      </div>
    );
  }

  // Cache hasn't registered yet (race) — render an inert placeholder card
  // so the image still appears.
  return (
    <div className="group/upload relative">
      <button
        type="button"
        disabled
        aria-label={asset.displayName}
        className={cn(
          "relative flex h-12 w-12 flex-col items-center justify-center rounded-md p-1.5",
          "border border-white/[0.04] bg-white/[0.02]",
        )}
      >
        {fallbackUrl ? (
          <img
            src={fallbackUrl}
            alt=""
            draggable={false}
            className="pointer-events-none size-9 select-none object-contain"
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground/40" />
        )}
      </button>
      <DeleteOverlay onClick={handleDelete} />
    </div>
  );
}

function DeleteOverlay({
  onClick,
}: {
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label="Delete upload"
            className={cn(
              "absolute -right-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full",
              "bg-destructive text-destructive-foreground shadow-sm",
              "opacity-0 transition-opacity duration-150 group-hover/upload:opacity-100 focus-visible:opacity-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
            )}
          />
        }
      >
        <Trash2Icon className="size-2.5" />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        Delete from library
      </TooltipContent>
    </Tooltip>
  );
}
