"use client";

import * as React from "react";
import type Konva from "konva";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  SYMBOL_DEFAULT_SIZE,
  SYMBOL_DRAG_MIME,
} from "@/lib/constants";
import { useStore } from "@/lib/store";

interface Args {
  stageRef: React.RefObject<Konva.Stage | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function useCanvasDrop({
  stageRef,
  containerRef,
}: Args): { dragHover: boolean } {
  const [dragHover, setDragHover] = React.useState(false);
  const addSymbol = useStore((s) => s.addSymbol);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const hasMime = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (const t of types) {
        if (t === SYMBOL_DRAG_MIME) return true;
      }
      return false;
    };

    const onDragEnter = (e: DragEvent) => {
      if (!hasMime(e)) return;
      e.preventDefault();
      setDragHover(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasMime(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDragHover(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasMime(e)) return;
      if (e.target === el || !el.contains(e.relatedTarget as Node | null)) {
        setDragHover(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      if (!hasMime(e)) return;
      e.preventDefault();
      setDragHover(false);
      const stage = stageRef.current;
      if (!stage) return;
      const symbolId = e.dataTransfer?.getData(SYMBOL_DRAG_MIME);
      if (!symbolId) return;

      const stageEl = stage.container();
      const rect = stageEl.getBoundingClientRect();
      const scale = stage.scaleX() || 1;
      const localX = (e.clientX - rect.left) / scale;
      const localY = (e.clientY - rect.top) / scale;

      const half = SYMBOL_DEFAULT_SIZE / 2;
      const x = clamp(localX - half, 0, STAGE_WIDTH - SYMBOL_DEFAULT_SIZE);
      const y = clamp(localY - half, 0, STAGE_HEIGHT - SYMBOL_DEFAULT_SIZE);

      addSymbol({ ref: symbolId, x, y });
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [stageRef, containerRef, addSymbol]);

  return { dragHover };
}
