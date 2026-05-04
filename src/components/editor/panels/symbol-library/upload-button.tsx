"use client";

import * as React from "react";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import {
  USER_ASSET_ACCEPT,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { uploadUserAssets, type UploadResult } from "@/lib/user-assets";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UploadButtonProps {
  onUploaded?: (result: UploadResult) => void;
}

export function UploadButton({ onUploaded }: UploadButtonProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleClick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      // Reset so the same file can be picked again later.
      e.target.value = "";
      const result = await uploadUserAssets(files);
      reportUploadResult(result);
      onUploaded?.(result);
    },
    [onUploaded],
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={handleClick}
              aria-label="Upload image"
              className={cn(
                "flex size-6 items-center justify-center rounded-md text-muted-foreground/80",
                "transition-colors hover:bg-white/[0.06] hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
              )}
            />
          }
        >
          <UploadIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Upload image
        </TooltipContent>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        accept={USER_ASSET_ACCEPT}
        multiple
        onChange={handleChange}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
    </>
  );
}

export function reportUploadResult(result: UploadResult): void {
  const { added, duplicates, rejected } = result;
  if (added.length === 1 && duplicates.length === 0 && rejected.length === 0) {
    toast.success(`Uploaded "${added[0].displayName}"`);
  } else if (added.length > 1 && rejected.length === 0) {
    toast.success(`Uploaded ${added.length} images`);
  } else if (added.length > 0) {
    toast.success(`Uploaded ${added.length}`, {
      description:
        rejected.length > 0
          ? `${rejected.length} skipped — see console for details.`
          : undefined,
    });
  }
  for (const dup of duplicates) {
    toast.message(`Already in your uploads`, {
      description: dup.displayName,
    });
  }
  for (const r of rejected) {
    toast.error(`Couldn't upload "${r.filename}"`, {
      description: rejectMessage(r.reason),
    });
  }
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
