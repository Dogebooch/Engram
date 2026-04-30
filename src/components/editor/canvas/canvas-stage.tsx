"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Rect, Stage } from "react-konva";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import { CanvasTransformer } from "./canvas-transformer";
import { setCurrentStage } from "./canvas-stage-ref";
import { DotGrid } from "./dot-grid";
import { SymbolContextMenu } from "./symbol-context-menu";
import { SymbolNode } from "./symbol-node";
import { useCanvasDrop } from "./use-canvas-drop";
import { useThumbnailCapture } from "./use-thumbnail-capture";

// Konva fallback for SSR / first-paint before CSS variables resolve. Matches the
// dark-mode `--stage` token so the unflashed render is indistinguishable.
const STAGE_PAPER_FALLBACK = "oklch(0.105 0 0)";

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
  const stageFill = useThemedCssVar("--stage", STAGE_PAPER_FALLBACK) ?? STAGE_PAPER_FALLBACK;
  const selectedIds = useStore((s) => s.selectedSymbolIds);
  const cursorSymbolIds = useStore((s) => s.cursorSymbolIds);
  const clearSelection = useStore((s) => s.clearSelection);
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const glowSet = React.useMemo(
    () => new Set(cursorSymbolIds),
    [cursorSymbolIds],
  );

  // For any selected symbol that's grouped, paint a subtle dashed outline on
  // every member of that group — the visual decode for "these are linked".
  const groupOutlineSymbols = React.useMemo(() => {
    if (selectedIds.length === 0 || symbols.length === 0) return EMPTY_SYMBOLS;
    const selSet = new Set(selectedIds);
    const activeGroupIds = new Set<string>();
    for (const sy of symbols) {
      if (selSet.has(sy.id) && sy.groupId) activeGroupIds.add(sy.groupId);
    }
    if (activeGroupIds.size === 0) return EMPTY_SYMBOLS;
    return symbols.filter((sy) => sy.groupId && activeGroupIds.has(sy.groupId));
  }, [selectedIds, symbols]);

  const { dragHover } = useCanvasDrop({ stageRef, containerRef });
  useThumbnailCapture(stageRef);

  React.useEffect(() => {
    return () => {
      setCurrentStage(null);
    };
  }, []);

  // react-konva does not auto-redraw the layer bitmap when only Rect/Circle
  // `fill` props change (no other geometry diff). When the theme flips, force
  // a synchronous draw so the paper + dot grid pick up the new tokens.
  React.useEffect(() => {
    stageRef.current?.draw();
  }, [stageFill]);

  const handleStageRef = React.useCallback((node: Konva.Stage | null) => {
    stageRef.current = node;
    setCurrentStage(node);
  }, []);

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
          "radial-gradient(ellipse at center, var(--stage-vignette-inner) 0%, var(--stage-vignette-outer) 70%)",
      }}
      onContextMenu={(e) => {
        // Suppress browser default context menu over the canvas area; the
        // SymbolContextMenu (per-symbol) handles right-click.
        e.preventDefault();
      }}
    >
      {box.scale > 0 && (
        <div
          data-engram-canvas-paper
          data-drag-hover={dragHover ? "" : undefined}
          className="pointer-events-auto absolute rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_60px_-30px_rgba(0,0,0,0.9)] ring-1 ring-black/40 after:pointer-events-none after:absolute after:inset-0 after:rounded-[2px] after:opacity-0 after:transition-opacity after:duration-200 after:ease-out after:shadow-[inset_0_0_0_1px_var(--accent),inset_0_0_56px_-12px_var(--accent),0_0_0_1px_color-mix(in_oklch,var(--accent)_50%,transparent)] data-[drag-hover]:after:opacity-100"
          style={{
            left: box.offsetX,
            top: box.offsetY,
            width: box.width,
            height: box.height,
          }}
        >
          <Stage
            ref={handleStageRef}
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
                fill={stageFill}
              />
              <DotGrid />
            </Layer>
            <Layer>
              {symbols.map((layer) => (
                <SymbolNode
                  key={layer.id}
                  layer={layer}
                  selected={selectedSet.has(layer.id)}
                  glowing={glowSet.has(layer.id)}
                  onMount={handleSymbolMount}
                />
              ))}
            </Layer>
            <Layer listening={false}>
              {groupOutlineSymbols.map((sy) => (
                <Rect
                  key={`group-outline-${sy.id}`}
                  x={sy.x - 4}
                  y={sy.y - 4}
                  width={sy.width + 8}
                  height={sy.height + 8}
                  rotation={sy.rotation}
                  stroke="oklch(0.78 0.13 75)"
                  strokeWidth={1}
                  dash={[4, 4]}
                  opacity={0.45}
                  cornerRadius={4}
                  fill={undefined}
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
      <CornerReadout scale={box.scale} />
      <SymbolContextMenu />
    </div>
  );
}

const EMPTY_SYMBOLS = [] as const;

function CornerReadout({ scale }: { scale: number }) {
  const pct = scale > 0 ? Math.round(scale * 100) : null;
  return (
    <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
      <span>1920 × 1080 · 16:9</span>
      {pct !== null && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-muted-foreground/80">{pct}%</span>
        </>
      )}
    </div>
  );
}
