export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "picmonic";
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...(bytes.subarray(i, i + chunk) as unknown as number[]),
    );
  }
  return btoa(binary);
}

// In the Tauri desktop webview the browser anchor-download is a no-op (no
// download manager), so route through a native Save-As dialog and a small
// Rust command that writes the bytes to the chosen path.
async function saveBlobViaTauri(blob: Blob, filename: string): Promise<void> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const ext = extOf(filename);
  const path = await save({
    defaultPath: filename,
    filters: ext
      ? [{ name: ext.toUpperCase(), extensions: [ext] }]
      : undefined,
  });
  if (!path) return; // user cancelled the dialog
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke("save_bytes", { path, dataB64: bytesToBase64(bytes) });
}

export async function downloadBlob(
  blob: Blob,
  filename: string,
): Promise<void> {
  if (isTauriRuntime()) {
    await saveBlobViaTauri(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function downloadText(
  text: string,
  filename: string,
  mime: string,
): Promise<void> {
  await downloadBlob(new Blob([text], { type: mime }), filename);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(",", 2);
  const mimeMatch = /data:([^;]+);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const bin = atob(body ?? "");
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
