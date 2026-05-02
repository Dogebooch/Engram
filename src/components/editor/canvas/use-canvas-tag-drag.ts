"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { clampToStage } from "@/lib/canvas/clamp-stage";

/**
 * Bridges a Konva symbol drag to DOM `## Fact` block drop targets in the
 * notes panel. While dragging, listens to `pointermove` globally and
 * highlights the fact block under the cursor (heading + bullets share
 * `data-fact-block`). On release over a block, reverts the symbol's
 * position (Konva mutated it during drag) and tags the symbol.
 *
 * Heading/body decorations are emitted by `fact-heading-extension.ts`;
 * this hook reads the DOM at drag time only.
 *
 * If the drop misses every fact block AND the pointer is released
 * outside the canvas container, the position update is canceled (the
 * symbol snaps back to where the drag started). Drops inside the canvas
 * but missing all blocks fall through to a normal positional update,
 * clamped to the stage bounds.
 */
export interface CanvasTagDragHandlers {
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}

const ACTIVE_BLOCK_ATTR = "data-fact-block-active";
const BODY_DRAGGING_ATTR = "data-engram-tag-dragging";
const BLOCK_SELECTOR = "[data-fact-block]";

interface DragState {
  origX: number;
  origY: number;
  dropFactId: string | null;
  activeFactId: string | null;
  cleanup: () => void;
}

function setBlockActive(factId: string | null, prev: string | null) {
  if (factId === prev) return;
  if (prev) {
    const old = document.querySelectorAll(
      `[data-fact-block="${cssEscape(prev)}"]`,
    );
    old.forEach((n) => (n as HTMLElement).removeAttribute(ACTIVE_BLOCK_ATTR));
  }
  if (factId) {
    const next = document.querySelectorAll(
      `[data-fact-block="${cssEscape(factId)}"]`,
    );
    next.forEach((n) => (n as HTMLElement).setAttribute(ACTIVE_BLOCK_ATTR, ""));
  }
}

function cssEscape(value: string): string {
  // factIds are URL-safe (synthesized hashes), so no escaping is required;
  // CSS.escape is browser-only and we want to keep this trivially testable.
  return value.replace(/"/g, '\\"');
}

function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
  return (
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  );
}

export function useCanvasTagDrag(symbolId: string): CanvasTagDragHandlers {
  const updateSymbol = useStore((s) => s.updateSymbol);
  const tagSymbolsWithFact = useStore((s) => s.tagSymbolsWithFact);
  const dragRef = React.useRef<DragState | null>(null);

  const onDragStart = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      const origX = node.x();
      const origY = node.y();
      const state: DragState = {
        origX,
        origY,
        dropFactId: null,
        activeFactId: null,
        cleanup: () => {},
      };

      const onPointerMove = (ev: PointerEvent) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const block =
          el instanceof Element
            ? (el.closest(BLOCK_SELECTOR) as HTMLElement | null)
            : null;
        const factId = block?.getAttribute("data-fact-block") ?? null;
        if (factId === state.activeFactId) return;
        setBlockActive(factId, state.activeFactId);
        state.activeFactId = factId;
        state.dropFactId = factId;
      };

      const onPointerUp = () => {
        // Konva will fire its own dragend; this is a backstop in case the
        // pointer is released over a non-Konva element.
      };

      document.body.setAttribute(BODY_DRAGGING_ATTR, "");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);

      state.cleanup = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.body.removeAttribute(BODY_DRAGGING_ATTR);
        setBlockActive(null, state.activeFactId);
        state.activeFactId = null;
      };

      dragRef.current = state;

      const container = node.getStage()?.container();
      if (container) container.style.cursor = "grabbing";
    },
    [],
  );

  const onDragEnd = React.useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      const state = dragRef.current;
      dragRef.current = null;

      if (!state) {
        // No drag state — fall through to a clamped positional update.
        const { x, y } = clampToStage(node.x(), node.y());
        node.x(x);
        node.y(y);
        updateSymbol(symbolId, { x, y });
        return;
      }

      state.cleanup();

      const stage = node.getStage();
      const container = stage?.container();
      if (container) container.style.cursor = "grab";

      if (state.dropFactId) {
        // Tag drop: revert position, tag the symbol.
        node.x(state.origX);
        node.y(state.origY);
        const wrote = tagSymbolsWithFact([symbolId], state.dropFactId);
        if (wrote) {
          toast("Tagged", { duration: 1200 });
        } else {
          toast("Already tagged", { duration: 1000 });
        }
        return;
      }

      // No fact target. Decide based on where the pointer ended up.
      const evt = e.evt as DragEvent;
      const containerRect = container?.getBoundingClientRect();
      const insideCanvas =
        containerRect != null &&
        Number.isFinite(evt.clientX) &&
        Number.isFinite(evt.clientY) &&
        isPointInRect(evt.clientX, evt.clientY, containerRect);

      if (insideCanvas) {
        // Normal positional drag inside canvas — clamp to stage bounds.
        const { x, y } = clampToStage(node.x(), node.y());
        node.x(x);
        node.y(y);
        updateSymbol(symbolId, { x, y });
      } else {
        // Released outside the canvas with no fact target — cancel.
        node.x(state.origX);
        node.y(state.origY);
      }
    },
    [symbolId, tagSymbolsWithFact, updateSymbol],
  );

  return { onDragStart, onDragEnd };
}
