"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

/**
 * Bridges a Konva symbol drag to DOM `## Fact` heading drop targets in the
 * notes panel. While dragging, listens to `pointermove` globally and
 * highlights the heading under the cursor (via data-attributes the CSS
 * watches). On release over a heading, reverts the symbol's position
 * (Konva mutated it during drag) and tags the symbol against that fact.
 *
 * Heading decorations are emitted by `fact-heading-extension.ts`; this hook
 * has no React dependency on parsed notes — it reads the DOM at drag time.
 */
export interface CanvasTagDragHandlers {
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}

const ACTIVE_HEADING_ATTR = "data-fact-heading-active";
const BODY_DRAGGING_ATTR = "data-engram-tag-dragging";
const HEADING_SELECTOR = "[data-fact-heading]";

interface DragState {
  origX: number;
  origY: number;
  dropFactId: string | null;
  activeEl: HTMLElement | null;
  cleanup: () => void;
}

function clearActive(el: HTMLElement | null) {
  if (el) el.removeAttribute(ACTIVE_HEADING_ATTR);
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
        activeEl: null,
        cleanup: () => {},
      };

      const onPointerMove = (ev: PointerEvent) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const heading =
          el instanceof Element
            ? (el.closest(HEADING_SELECTOR) as HTMLElement | null)
            : null;
        if (heading === state.activeEl) return;
        clearActive(state.activeEl);
        state.activeEl = heading;
        state.dropFactId =
          (heading?.getAttribute("data-fact-id") as string | null) ?? null;
        if (heading) heading.setAttribute(ACTIVE_HEADING_ATTR, "");
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
        clearActive(state.activeEl);
        state.activeEl = null;
      };

      dragRef.current = state;

      // Match the existing cursor affordance from symbol-node.
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
        // No drag state — fall through to normal positional update.
        updateSymbol(symbolId, { x: node.x(), y: node.y() });
        return;
      }

      state.cleanup();

      const container = node.getStage()?.container();
      if (container) container.style.cursor = "grab";

      if (state.dropFactId) {
        // Tag drop: revert position, tag the symbol.
        node.x(state.origX);
        node.y(state.origY);
        const wrote = tagSymbolsWithFact([symbolId], state.dropFactId);
        if (wrote) {
          // Quiet feedback — sync layer will glow the chip.
          toast("Tagged", { duration: 1200 });
        } else {
          // Already tagged here — let user know nothing changed.
          toast("Already tagged", { duration: 1000 });
        }
      } else {
        // Normal positional drag: write the new x/y to the store.
        updateSymbol(symbolId, { x: node.x(), y: node.y() });
      }
    },
    [symbolId, tagSymbolsWithFact, updateSymbol],
  );

  return { onDragStart, onDragEnd };
}
