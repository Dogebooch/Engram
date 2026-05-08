import { toast } from "sonner";
import { USER_ASSET_MAX_BYTES } from "@/lib/constants";
import type { UploadResult } from "@/lib/user-assets";

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
