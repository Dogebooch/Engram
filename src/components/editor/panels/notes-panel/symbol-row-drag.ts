import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { createDragGhost } from "./drag-ghost";

/**
 * Pointer-drag a symbol bullet row onto another `## Fact` card to re-home it.
 *
 * Reuses the same DOM affordance as the canvas→notes tag-drag
 * ([use-canvas-tag-drag.ts]): `data-engram-tag-dragging` on `<body>` plus
 * `data-fact-block-active` on the hovered fact block (styled in globals.css).
 * The symbol chip is the drag handle — a press that stays put is a click
 * (select), a press that moves past the threshold starts a move.
 */

const ACTIVE_BLOCK_ATTR = "data-fact-block-active";
const BODY_DRAGGING_ATTR = "data-engram-tag-dragging";
const BLOCK_SELECTOR = "[data-fact-block]";
const DRAG_THRESHOLD = 5;

function cssEscape(value: string): string {
  // factIds are URL-safe synthesized hashes — only quotes need escaping.
  return value.replace(/"/g, '\\"');
}

function setBlockActive(factId: string | null, prev: string | null): void {
  if (factId === prev) return;
  if (prev) {
    document
      .querySelectorAll(`[data-fact-block="${cssEscape(prev)}"]`)
      .forEach((n) => (n as HTMLElement).removeAttribute(ACTIVE_BLOCK_ATTR));
  }
  if (factId) {
    document
      .querySelectorAll(`[data-fact-block="${cssEscape(factId)}"]`)
      .forEach((n) => (n as HTMLElement).setAttribute(ACTIVE_BLOCK_ATTR, ""));
  }
}

export interface SymbolRowDragOptions {
  symbolId: string;
  fromFactId: string | null;
  event: PointerEvent;
  label: string;
  imageUrl: string | null;
  onSelect: () => void;
}

export function beginSymbolRowDragOrSelect(opts: SymbolRowDragOptions): void {
  const { symbolId, fromFactId, event, label, imageUrl, onSelect } = opts;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let activeFactId: string | null = null;
  let ghost: HTMLElement | null = null;

  const startDrag = () => {
    dragging = true;
    document.body.setAttribute(BODY_DRAGGING_ATTR, "");
    ghost = createDragGhost(label, imageUrl);
    document.body.appendChild(ghost);
  };

  const onMove = (ev: PointerEvent) => {
    if (!dragging) {
      if (
        Math.abs(ev.clientX - startX) < DRAG_THRESHOLD &&
        Math.abs(ev.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      startDrag();
    }
    if (ghost) {
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 14}px)`;
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const block =
      el instanceof Element
        ? (el.closest(BLOCK_SELECTOR) as HTMLElement | null)
        : null;
    const factId = block?.getAttribute("data-fact-block") ?? null;
    if (factId === activeFactId) return;
    setBlockActive(factId, activeFactId);
    activeFactId = factId;
  };

  const onUp = () => {
    const target = activeFactId;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.removeAttribute(BODY_DRAGGING_ATTR);
    setBlockActive(null, activeFactId);
    ghost?.remove();

    if (!dragging) {
      onSelect();
      return;
    }
    if (target && fromFactId && target !== fromFactId) {
      const moved = useStore
        .getState()
        .moveSymbolToFact(symbolId, fromFactId, target);
      toast(moved ? "Moved" : "Already there", { duration: 1200 });
    }
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}
