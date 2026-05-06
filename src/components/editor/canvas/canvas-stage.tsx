"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Rect, Stage } from "react-konva";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import {
  marqueeHitTest,
  normalizeRect,
  type Rect as MarqueeRect,
} from "@/lib/canvas/marquee-hit-test";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import { BackdropChip } from "./backdrop-chip";
import { BackdropLayer } from "./backdrop-layer";
import { CanvasTransformer } from "./canvas-transformer";
import { setCurrentStage } from "./canvas-stage-ref";
import { DotGrid } from "./dot-grid";
import { ReplaceSymbolPopover } from "./replace-symbol-popover";
import { SymbolContextMenu } from "./symbol-context-menu";
import { SymbolNode } from "./symbol-node";
import { useBackdropFileDrop } from "./use-backdrop-file-drop";
import { useCanvasDrop } from "./use-canvas-drop";
import { useThumbnailCapture } from "./use-thumbnail-capture";

// Konva fallback for SSR / first-paint before CSS variables resolve. Matches the
// dark-mode `--stage` token so the unflashed render is indistinguishable.
const STAGE_PAPER_FALLBACK = "oklch(0.105 0 0)";

const MARQUEE_DRAG_THRESHOLD = 4;

interface FitBox {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

const ZERO_BOX: FitBox = { width: 0, height: 0, scale: 0, offsetX: 0, offsetY: 0 };

type MarqueeState =
  | { kind: "idle" }
  | {
      kind: "pending";
      downX: number;
      downY: number;
      shift: boolean;
      baseSelection: string[];
    }
  | {
      kind: "active";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      shift: boolean;
      baseSelection: string[];
    };

const IDLE_MARQUEE: MarqueeState = { kind: "idle" };

// Module-scoped cancel hook so the global Escape handler in keybindings.ts
// can abort an in-flight marquee without prop drilling.
let marqueeCancelHandler: (() => boolean) | null = null;

export function cancelMarqueeIfActive(): boolean {
  return marqueeCancelHandler ? marqueeCancelHandler() : false;
}

export function CanvasStage() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<Konva.Stage | null>(null);
  const symbolRefs = React.useRef<Map<string, Konva.Image>>(new Map());
  const [box, setBox] = React.useState<FitBox>(ZERO_BOX);

  const picmonic = usePicmonic();
  const symbols = picmonic?.canvas.symbols ?? EMPTY_SYMBOLS;
  const backdrop = picmonic?.canvas.backdrop ?? null;
  const stageFill = useThemedCssVar("--stage", STAGE_PAPER_FALLBACK) ?? STAGE_PAPER_FALLBACK;
  const accent = useThemedCssVar("--accent", "#7dd3fc") ?? "#7dd3fc";
  const selectedIds = useStore((s) => s.selectedSymbolIds);
  const cursorSymbolIds = useStore((s) => s.cursorSymbolIds);
  const clearSelection = useStore((s) => s.clearSelection);
  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
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
  const { fileHover } = useBackdropFileDrop({ containerRef });
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

  // Marquee state machine — purely local; selection commits only on mouseup.
  // The ref tracks the same value the React state holds; we keep both because
  // event handlers need the latest value synchronously (ref) while the render
  // path needs to react to changes (state).
  const marqueeStateRef = React.useRef<MarqueeState>(IDLE_MARQUEE);
  const [marquee, setMarqueeState] = React.useState<MarqueeState>(IDLE_MARQUEE);
  const setMarquee = React.useCallback(
    (next: MarqueeState | ((prev: MarqueeState) => MarqueeState)) => {
      const value =
        typeof next === "function"
          ? (next as (p: MarqueeState) => MarqueeState)(marqueeStateRef.current)
          : next;
      marqueeStateRef.current = value;
      setMarqueeState(value);
    },
    [],
  );

  // Latest symbols available to mouseup handler without recreating callbacks
  // each render.
  const symbolsRef = React.useRef(symbols);
  React.useEffect(() => {
    symbolsRef.current = symbols;
  }, [symbols]);

  const stageLocalFromClient = React.useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const r = stage.container().getBoundingClientRect();
      const sc = stage.scaleX() || 1;
      return { x: (clientX - r.left) / sc, y: (clientY - r.top) / sc };
    },
    [],
  );

  const handleStageMouseDown = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      // Only react to primary button; right-click is consumed by the div
      // onContextMenu and per-symbol handlers.
      if (e.evt.button !== 0) return;
      const local = stageLocalFromClient(e.evt.clientX, e.evt.clientY);
      if (!local) return;
      setMarquee({
        kind: "pending",
        downX: local.x,
        downY: local.y,
        shift: e.evt.shiftKey,
        baseSelection: useStore.getState().selectedSymbolIds.slice(),
      });
    },
    [stageLocalFromClient],
  );

  // Document-level mousemove/mouseup so the user can drag past the stage
  // bounds without the marquee getting stuck. Attached only while a drag is
  // pending or active.
  React.useEffect(() => {
    if (marquee.kind === "idle") return;

    const onMove = (e: MouseEvent) => {
      const local = stageLocalFromClient(e.clientX, e.clientY);
      if (!local) return;
      setMarquee((prev) => {
        if (prev.kind === "idle") return prev;
        if (prev.kind === "pending") {
          const dx = local.x - prev.downX;
          const dy = local.y - prev.downY;
          if (Math.hypot(dx, dy) < MARQUEE_DRAG_THRESHOLD) return prev;
          return {
            kind: "active",
            startX: prev.downX,
            startY: prev.downY,
            endX: local.x,
            endY: local.y,
            shift: prev.shift,
            baseSelection: prev.baseSelection,
          };
        }
        return { ...prev, endX: local.x, endY: local.y };
      });
    };

    const onUp = () => {
      // Read latest marquee state via ref so we can run side-effects
      // (selection writes) outside the setMarquee updater. Updater functions
      // must be pure — running setState on another store there triggers the
      // "setState while rendering" warning.
      const prev = marqueeStateRef.current;
      if (prev.kind === "pending") {
        if (useStore.getState().selectedSymbolIds.length > 0) {
          clearSelection();
        }
        setMarquee(IDLE_MARQUEE);
        return;
      }
      if (prev.kind === "active") {
        const rect: MarqueeRect = normalizeRect(
          prev.startX,
          prev.startY,
          prev.endX,
          prev.endY,
        );
        const hits = marqueeHitTest(rect, symbolsRef.current);
        let next: string[];
        if (prev.shift) {
          const seen = new Set<string>();
          next = [];
          for (const id of [...prev.baseSelection, ...hits]) {
            if (!seen.has(id)) {
              seen.add(id);
              next.push(id);
            }
          }
        } else {
          next = hits;
        }
        const cur = useStore.getState().selectedSymbolIds;
        const same =
          cur.length === next.length && cur.every((v, i) => v === next[i]);
        if (!same) setSelectedSymbolIds(next);
        setMarquee(IDLE_MARQUEE);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [marquee.kind, clearSelection, setSelectedSymbolIds, stageLocalFromClient]);

  // Register the global marquee-cancel hook for the Escape ladder.
  React.useEffect(() => {
    marqueeCancelHandler = () => {
      let cancelled = false;
      setMarquee((prev) => {
        if (prev.kind === "active" || prev.kind === "pending") {
          cancelled = true;
          return IDLE_MARQUEE;
        }
        return prev;
      });
      return cancelled;
    };
    return () => {
      marqueeCancelHandler = null;
    };
  }, []);

  const symbolsKey = React.useMemo(
    () => symbols.map((s) => s.id).join("|"),
    [symbols],
  );

  // Marquee Rect props (only used while active).
  const marqueeRect: MarqueeRect | null =
    marquee.kind === "active"
      ? normalizeRect(marquee.startX, marquee.startY, marquee.endX, marquee.endY)
      : null;

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
            {backdrop && backdrop.uploadedBlobId && (
              <BackdropLayer backdrop={backdrop} />
            )}
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
            <Layer name="export-chrome" listening={false}>
              {groupOutlineSymbols.map((sy) => (
                <Rect
                  key={`group-outline-${sy.id}`}
                  x={sy.x - 4}
                  y={sy.y - 4}
                  width={sy.width + 8}
                  height={sy.height + 8}
                  rotation={sy.rotation}
                  stroke={accent}
                  strokeWidth={1}
                  dash={[4, 4]}
                  opacity={0.45}
                  cornerRadius={4}
                  fill={undefined}
                />
              ))}
            </Layer>
            <Layer name="export-chrome">
              <CanvasTransformer
                selectedIds={selectedIds}
                symbolsKey={symbolsKey}
                getNode={(id) => symbolRefs.current.get(id) ?? null}
              />
            </Layer>
            <Layer name="marquee" listening={false}>
              {marqueeRect && (
                <>
                  <Rect
                    x={marqueeRect.x}
                    y={marqueeRect.y}
                    width={marqueeRect.width}
                    height={marqueeRect.height}
                    fill={accent}
                    opacity={0.1}
                  />
                  <Rect
                    x={marqueeRect.x}
                    y={marqueeRect.y}
                    width={marqueeRect.width}
                    height={marqueeRect.height}
                    stroke={accent}
                    strokeWidth={1 / box.scale}
                    dash={[4 / box.scale, 4 / box.scale]}
                    opacity={0.85}
                  />
                </>
              )}
            </Layer>
          </Stage>
        </div>
      )}
      {fileHover && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-md border-2 border-dashed border-[var(--accent)]/80 bg-background/70 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Drop image
            </span>
            <span className="text-sm font-medium text-foreground">
              Set as background
            </span>
          </div>
        </div>
      )}
      <BackdropChip faded={fileHover || marquee.kind === "active"} />
      <CornerReadout scale={box.scale} />
      <SymbolContextMenu />
      <ReplaceSymbolPopover />
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
