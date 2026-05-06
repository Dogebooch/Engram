"use client";

import * as React from "react";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import {
  USER_ASSET_ACCEPT,
  USER_ASSET_MAX_BYTES,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { useCurrentPicmonicId } from "@/lib/store/hooks";
import { uploadBackdropImage } from "@/lib/user-assets";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Library-header upload affordance for backgrounds. Adds the file to the
 * background asset library and applies it to the current scene as the
 * convenient default.
 */
export function UploadsBackgroundButton() {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const setBackdropFromAsset = useStore((s) => s.setBackdropFromAsset);
  const currentPicmonicId = useCurrentPicmonicId();

  const handleClick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      const file = list[0];
      e.target.value = "";
      const result = await uploadBackdropImage(file);
      if (result.kind !== "ok") {
        toast.error("Couldn't add background", {
          description: rejectMessage(result.reason),
        });
        return;
      }
      if (currentPicmonicId) {
        setBackdropFromAsset(result.id);
        toast.success(
          result.reusedExisting
            ? "Reused existing background"
            : "Background added & applied",
          { description: result.asset.displayName },
        );
      } else {
        toast.success(
          result.reusedExisting ? "Already in library" : "Background added",
          { description: result.asset.displayName },
        );
      }
    },
    [setBackdropFromAsset, currentPicmonicId],
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={handleClick}
              aria-label="Upload background"
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
          Upload background
        </TooltipContent>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        accept={USER_ASSET_ACCEPT}
        onChange={handleChange}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
    </>
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
