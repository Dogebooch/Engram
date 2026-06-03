"use client";

import { ImagePlusIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadPicmonic } from "./use-upload-picmonic";

interface UploadPicmonicButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
  onAfterUpload?: (id: string) => void;
}

/**
 * Primary CTA on the home library: "Upload picture mnemonic." Single
 * gesture to go from "I have a reference image" to "editor is open with
 * that image set as the backdrop." Anki's Add Card analog.
 */
export function UploadPicmonicButton({
  variant = "default",
  size = "default",
  className,
  onAfterUpload,
}: UploadPicmonicButtonProps) {
  const { inputRef, onFile, pick, busy, acceptAttr } = useUploadPicmonic({
    onAfterUpload,
  });

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={pick}
        disabled={busy}
        className={className}
        aria-label="Upload picture mnemonic"
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
        <span>Upload picture mnemonic</span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        className="hidden"
        onChange={onFile}
      />
    </>
  );
}
