/**
 * Build the floating chip that follows the cursor during a notes-panel
 * pointer-drag (symbol rows, fact cards, sections). Shared by `outline-drag`
 * and `symbol-row-drag`; the caller appends it to `<body>`, positions it via
 * `transform`, and removes it on drop.
 */
export function createDragGhost(
  label: string,
  imageUrl: string | null,
): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "eng-row-drag-ghost";
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    ghost.appendChild(img);
  }
  const text = document.createElement("span");
  text.textContent = label;
  ghost.appendChild(text);
  return ghost;
}
