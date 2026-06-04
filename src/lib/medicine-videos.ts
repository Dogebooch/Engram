import type { MedicineVideo } from "@/lib/types/source-video";

export type MedicineVideosLoadResult =
  | { status: "ok"; videos: MedicineVideo[] }
  | { status: "unavailable"; videos: []; message: string }
  | { status: "error"; videos: []; message: string };

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadMedicineVideos(): Promise<MedicineVideosLoadResult> {
  if (!isTauriRuntime()) {
    return {
      status: "unavailable",
      videos: [],
      message: "Medicine Videos checklist is available in the desktop app.",
    };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<MedicineVideosLoadResult>("list_medicine_videos");
    return result;
  } catch (err) {
    return {
      status: "error",
      videos: [],
      message:
        err instanceof Error && err.message
          ? err.message
          : "Could not load Medicine Videos.",
    };
  }
}
