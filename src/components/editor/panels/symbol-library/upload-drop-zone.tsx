"use client";

import * as React from "react";
import { UploadIcon } from "lucide-react";
import { uploadUserAssets } from "@/lib/user-assets";
import { cn } from "@/lib/utils";
import { reportUploadResult } from "./upload-button";

interface UploadDropZoneProps {
  onUploaded?: () => void;
  children: React.ReactNode;
}

function dragHasFiles(e: React.DragEvent<HTMLDivElement>): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === "Files") return true;
  }
  return false;
}

export function UploadDropZone({ onUploaded, children }: UploadDropZoneProps) {
  const [over, setOver] = React.useState(false);
  const depthRef = React.useRef(0);

  const handleDragEnter = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depthRef.current += 1;
      setOver(true);
    },
    [],
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [],
  );

  const handleDragLeave = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!dragHasFiles(e)) return;
      depthRef.current -= 1;
      if (depthRef.current <= 0) {
        depthRef.current = 0;
        setOver(false);
      }
    },
    [],
  );

  const handleDrop = React.useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depthRef.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;
      const result = await uploadUserAssets(files);
      reportUploadResult(result);
      if (result.added.length > 0 || result.duplicates.length > 0) {
        onUploaded?.();
      }
    },
    [onUploaded],
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex h-full min-h-0 flex-col"
    >
      {children}
      {over && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-center justify-center",
            "rounded-md border-2 border-dashed border-[var(--accent)]/80 bg-background/80 backdrop-blur-sm",
          )}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <UploadIcon className="size-6 text-[var(--accent)]" />
            <span className="text-xs font-medium text-foreground">
              Drop image to upload
            </span>
            <span className="text-[10px] text-muted-foreground">
              PNG, JPG, WebP, SVG, GIF
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
