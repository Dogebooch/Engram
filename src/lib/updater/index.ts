"use client";

import * as React from "react";
import { toast } from "sonner";
import type { Update } from "@tauri-apps/plugin-updater";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

interface CheckOptions {
  /** Suppress "you're up to date" / web-build / network-error toasts.
   *  Used by the silent on-startup check. */
  silent?: boolean;
}

export async function checkForUpdates({ silent = false }: CheckOptions = {}): Promise<void> {
  if (!isTauri()) {
    if (!silent) {
      toast("Auto-update is only available in the installed desktop app.", {
        duration: 3000,
      });
    }
    return;
  }

  let update: Update | null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    update = await check();
  } catch (err) {
    if (!silent) {
      console.error("Update check failed", err);
      toast.error("Couldn't check for updates. Are you online?");
    }
    return;
  }

  if (!update?.available) {
    if (!silent) {
      toast("You're on the latest version.", { duration: 2200 });
    }
    return;
  }

  toast(`Update available — v${update.version}`, {
    description: "The app will close briefly and relaunch.",
    duration: 30_000,
    action: {
      label: "Install",
      onClick: () => {
        void runUpdate(update);
      },
    },
  });
}

async function runUpdate(update: Update): Promise<void> {
  const downloadingId = toast.loading("Downloading update…");
  try {
    await update.downloadAndInstall();
    toast.dismiss(downloadingId);
    toast("Update installed. Relaunching…", { duration: 2000 });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    toast.dismiss(downloadingId);
    console.error("Update install failed", err);
    toast.error("Update failed. Try again, or grab the latest installer from Releases.");
  }
}

/** Auto-check on app startup. No-op outside Tauri; silent on failure. */
export function useUpdaterCheck(): void {
  React.useEffect(() => {
    if (!isTauri()) return;
    void checkForUpdates({ silent: true });
  }, []);
}
