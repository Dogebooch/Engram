"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Rect, Stage } from "react-konva";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { CanvasTransformer } from "./canvas-transformer";
import { DotGrid } from "./dot-grid";
import { SymbolNode } from "./symbol-node";
import { useCanvasDrop } from "./use-canvas-drop";

const STAGE_PAPER_FILL = "#181818";

interface FitBox {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

const ZERO_BOX: FitBox = { width: 0, height: 0, scale: 0, offsetX: 0, offsetY: 0 };

export function CanvasStage() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<Konva.Stage | null>(null);
  const symbolRefs = React.useRef<Map<string, Konva.Image>>(new Map());
  const [box, setBox] = React.useState<FitBox>(ZERO_BOX);

  const picmonic = usePicmonic();
  const symbols = picmonic?.canvas.symbols ?? EMPTY_SYMBOLS;
  const selectedIds = useStore((s) => s.selectedSymbolIds);
  const clearSelection = useStore((s) => s.clearSelection);
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  const { dragHover } = useCanvasDrop({ stageRef, containerRef });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = (cw: number, ch: number) => {
      if (cw <= 0 || ch <= 0) return ZERO_BOX;
      const scaleX = cw / STAGE_WIDTH;
      const scaleY = ch / STAGE_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      const width = STAGE_WIDTH * scale;
      const height = STAGE_HEIGHT * scale;
      const offsetX = Math.round((cw - width) / 2);
      const offsetY = Math.round((ch - height) / 2);
      return { width, height, scale, offsetX, offsetY };
    };

    const apply = (cw: number, ch: number) => {
      const next = compute(cw, ch);
      setBox((prev) => {
        if (
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
        ) {
          return prev;
        }
        return next;
      });
    };

    const rect = el.getBoundingClientRect();
    apply(rect.width, rect.height);

    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      apply(entry.contentRect.width, entry.contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleSymbolMount = React.useCallback(
    (id: string, node: Konva.Image | null) => {
      if (node) {
        symbolRefs.current.set(id, node);
      } else {
        symbolRefs.current.delete(id);
      }
    },
    [],
  );

  const handleStageMouseDown = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  const symbolsKey = React.useMemo(
    () => symbols.map((s) => s.id).join("|"),
    [symbols],
  );

  return (
    <div
      ref={containerRef}
      data-engram-canvas-root
      className="relative h-full w-full overflow-hidden bg-stage"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at center, oklch(0.13 0 0) 0%, oklch(0.105 0 0) 70%)",
      }}
    >
      {box.scale > 0 && (
        <div
          data-engram-canvas-paper
          data-drag-hover={dragHover ? "" : undefined}
          className="pointer-events-auto absolute rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_60px_-30px_rgba(0,0,0,0.9)] ring-1 ring-black/40 transition-shadow duration-150 data-[drag-hover]:shadow-[0_0_0_2px_var(--accent),0_24px_60px_-30px_rgba(0,0,0,0.9)]"
          style={{
            left: box.offsetX,
            top: box.offsetY,
            width: box.width,
            height: box.height,
          }}
        >
          <Stage
            ref={stageRef}
            width={box.width}
            height={box.height}
            scaleX={box.scale}
            scaleY={box.scale}
            onMouseDown={handleStageMouseDown}
          >
            <Layer listening={false}>
              <Rect
                x={0}
                y={0}
                width={STAGE_WIDTH}
                height={STAGE_HEIGHT}
                fill={STAGE_PAPER_FILL}
              />
              <DotGrid />
            </Layer>
            <Layer>
              {symbols.map((layer) => (
                <SymbolNode
                  key={layer.id}
                  layer={layer}
                  selected={selectedSet.has(layer.id)}
                  onMount={handleSymbolMount}
                />
              ))}
            </Layer>
            <Layer>
              <CanvasTransformer
                selectedIds={selectedIds}
                symbolsKey={symbolsKey}
                getNode={(id) => symbolRefs.current.get(id) ?? null}
              />
            </Layer>
          </Stage>
        </div>
      )}
      <CornerReadout />
    </div>
  );
}

const EMPTY_SYMBOLS = [] as const;

function CornerReadout() {
  return (
    <div className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
      1920 × 1080 · 16:9
    </div>
  );
}
