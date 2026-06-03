"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Line, Rect, Stage } from "react-konva";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import {
  marqueeHitTest,
  normalizeRect,
  type Rect as MarqueeRect,
} from "@/lib/canvas/marquee-hit-test";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import { BackdropLayer } from "./backdrop-layer";
import { CanvasTransformer } from "./canvas-transformer";
import { setCurrentStage } from "./canvas-stage-ref";
import { DotGrid } from "./dot-grid";
import { ReplaceSymbolPopover } from "./replace-symbol-popover";
import { StageContextMenu } from "./stage-context-menu";
import { SymbolContextMenu } from "./symbol-context-menu";
import { SymbolNode } from "./symbol-node";
import { useBackdropFileDrop } from "./use-backdrop-file-drop";
import { useCanvasDrop } from "./use-canvas-drop";
import { useThumbnailCapture } from "./use-thumbnail-capture";
import type { AlignmentGuide } from "./alignment-guides";
import { OutlinesPanel } from "./outlines-panel";
import { SetupChecklist } from "./setup-checklist";

const STAGE_PAPER_FALLBACK = "oklch(0.105 0 0)";

const MARQUEE_DRAG_THRESHOLD = 4;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.1;

interface FitBox {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

const ZERO_BOX: FitBox = { width: 0, height: 0, scale: 0, offsetX: 0, offsetY: 0 };
const RESET_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

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

let marqueeCancelHandler: (() => boolean) | null = null;
let viewportControl: {
  reset: () => void;
  fit: () => void;
  to100: () => void;
} | null = null;

export function cancelMarqueeIfActive(): boolean {
  return marqueeCancelHandler ? marqueeCancelHandler() : false;
}

export function resetCanvasViewport(): void {
  viewportControl?.fit();
}

export function setCanvasViewportToHundred(): void {
  viewportControl?.to100();
}

export function CanvasStage() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<Konva.Stage | null>(null);
  const symbolRefs = React.useRef<Map<string, Konva.Image>>(new Map());
  const [box, setBox] = React.useState<FitBox>(ZERO_BOX);
  const [viewport, setViewport] = React.useState<Viewport>(RESET_VIEWPORT);
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  const [panning, setPanning] = React.useState(false);

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
  const [alignGuides, setAlignGuides] = React.useState<AlignmentGuide[]>([]);

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

  React.useEffect(() => {
    stageRef.current?.draw();
  }, [stageFill]);

  // Reset viewport when switching picmonics so we don't carry zoom/pan into a
  // different scene. Derived during render via a "previous id" ref instead of
  // an effect, so we don't pay an extra render cycle on every picmonic switch.
  const picmonicId = picmonic?.id ?? null;
  const lastPicmonicIdRef = React.useRef<string | null>(picmonicId);
  if (lastPicmonicIdRef.current !== picmonicId) {
    lastPicmonicIdRef.current = picmonicId;
    if (viewport !== RESET_VIEWPORT) {
      setViewport(RESET_VIEWPORT);
    }
  }

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

  const symbolsRef = React.useRef(symbols);
  React.useEffect(() => {
    symbolsRef.current = symbols;
  }, [symbols]);

  const viewportRef = React.useRef(viewport);
  React.useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  const boxRef = React.useRef(box);
  React.useEffect(() => {
    boxRef.current = box;
  }, [box]);

  // Convert a client (viewport pixel) coordinate into stage-world coordinates
  // accounting for fit-scale + user zoom + pan.
  const stageLocalFromClient = React.useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const r = stage.container().getBoundingClientRect();
      const b = boxRef.current;
      const v = viewportRef.current;
      const totalScale = (b.scale || 1) * v.zoom;
      return {
        x: (clientX - r.left - v.panX) / totalScale,
        y: (clientY - r.top - v.panY) / totalScale,
      };
    },
    [],
  );

  const openStageContextMenu = useStore((s) => s.openStageContextMenu);

  const handleStageContextMenu = React.useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (e.target !== e.target.getStage()) return;
      e.evt.preventDefault();
      const local = stageLocalFromClient(e.evt.clientX, e.evt.clientY);
      if (!local) return;
      openStageContextMenu(e.evt.clientX, e.evt.clientY, local.x, local.y);
    },
    [openStageContextMenu, stageLocalFromClient],
  );

  const handleStageMouseDown = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      if (e.evt.button !== 0) return;
      // Suppress marquee while space-pan is active; that gesture pans instead.
      if (spaceHeld) return;
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
    [spaceHeld, stageLocalFromClient],
  );

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

  // Wheel zoom (around cursor). Plain wheel scrolls; ctrl/meta+wheel zooms in
  // the same gesture browsers already use for in-page zoom, which feels native.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const offX = e.clientX - rect.left - boxRef.current.offsetX;
      const offY = e.clientY - rect.top - boxRef.current.offsetY;
      setViewport((prev) => {
        const dir = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * dir));
        if (nextZoom === prev.zoom) return prev;
        // Pan target: keep the world point under cursor stationary.
        // worldX = (offX - panX) / (fit * zoom). After zoom, set panX so
        // worldX maps to same screen offX.
        const fit = boxRef.current.scale || 1;
        const worldX = (offX - prev.panX) / (fit * prev.zoom);
        const worldY = (offY - prev.panY) / (fit * prev.zoom);
        const panX = offX - worldX * fit * nextZoom;
        const panY = offY - worldY * fit * nextZoom;
        return { zoom: nextZoom, panX, panY };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Space-drag-pan. Hold space, then click-drag to pan. Space alone changes
  // cursor; the actual pan is a click+drag while space is held.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      setSpaceHeld(false);
      setPanning(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  React.useEffect(() => {
    if (!spaceHeld) return;
    const el = containerRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;
    let active = false;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startPanX = viewportRef.current.panX;
      startPanY = viewportRef.current.panY;
      active = true;
      setPanning(true);
    };
    const onMove = (e: MouseEvent) => {
      if (!active) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setViewport((prev) => ({ ...prev, panX: startPanX + dx, panY: startPanY + dy }));
    };
    const onUp = () => {
      active = false;
      setPanning(false);
    };
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [spaceHeld]);

  // Imperative reset for keybindings.ts to call without prop drilling.
  React.useEffect(() => {
    viewportControl = {
      reset: () => setViewport(RESET_VIEWPORT),
      fit: () => setViewport(RESET_VIEWPORT),
      to100: () => {
        const b = boxRef.current;
        if (b.scale <= 0) return;
        const targetZoom = 1 / b.scale;
        // Center the world in the viewport when going to 100%.
        const panX = (b.width - STAGE_WIDTH * b.scale * targetZoom) / 2;
        const panY = (b.height - STAGE_HEIGHT * b.scale * targetZoom) / 2;
        setViewport({ zoom: targetZoom, panX, panY });
      },
    };
    return () => {
      viewportControl = null;
    };
  }, []);

  const symbolsKey = React.useMemo(
    () => symbols.map((s) => s.id).join("|"),
    [symbols],
  );

  const marqueeRect: MarqueeRect | null =
    marquee.kind === "active"
      ? normalizeRect(marquee.startX, marquee.startY, marquee.endX, marquee.endY)
      : null;

  const totalScale = (box.scale || 1) * viewport.zoom;
  const pxToWorld = totalScale > 0 ? 1 / totalScale : 1;

  const cursorClass = panning
    ? "cursor-grabbing"
    : spaceHeld
      ? "cursor-grab"
      : "";

  return (
    <div
      ref={containerRef}
      data-engram-canvas-root
      role="application"
      aria-label="Mnemonic scene canvas. Drag symbols from the library to outline; arrow keys nudge; hold Space to pan; Ctrl/Cmd-scroll to zoom."
      className={`relative h-full w-full overflow-hidden bg-stage ${cursorClass}`}
      style={{
        backgroundImage:
          "radial-gradient(ellipse at center, var(--stage-vignette-inner) 0%, var(--stage-vignette-outer) 70%)",
      }}
      onContextMenu={(e) => {
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
            scaleX={totalScale}
            scaleY={totalScale}
            x={viewport.panX}
            y={viewport.panY}
            onMouseDown={handleStageMouseDown}
            onContextMenu={handleStageContextMenu}
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
                  onAlignmentGuides={setAlignGuides}
                />
              ))}
            </Layer>
            {/* Single overlay layer collapses former group-outline / transformer / marquee
                trio into one Konva layer so the stage stays under the recommended
                3-5 layer ceiling. */}
            <Layer name="overlay">
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
                  listening={false}
                />
              ))}
              {alignGuides.map((g, i) => (
                <Line
                  key={`align-${i}`}
                  points={g.points}
                  stroke={accent}
                  strokeWidth={1 * pxToWorld}
                  dash={[4 * pxToWorld, 4 * pxToWorld]}
                  opacity={0.85}
                  listening={false}
                />
              ))}
              <CanvasTransformer
                selectedIds={selectedIds}
                symbolsKey={symbolsKey}
                getNode={(id) => symbolRefs.current.get(id) ?? null}
              />
              {marqueeRect && (
                <>
                  <Rect
                    x={marqueeRect.x}
                    y={marqueeRect.y}
                    width={marqueeRect.width}
                    height={marqueeRect.height}
                    fill={accent}
                    opacity={0.1}
                    listening={false}
                  />
                  <Rect
                    x={marqueeRect.x}
                    y={marqueeRect.y}
                    width={marqueeRect.width}
                    height={marqueeRect.height}
                    stroke={accent}
                    strokeWidth={pxToWorld}
                    dash={[4 * pxToWorld, 4 * pxToWorld]}
                    opacity={0.85}
                    listening={false}
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
      <CornerReadout
        scale={box.scale}
        zoom={viewport.zoom}
        symbolCount={symbols.length}
      />
      <OutlinesPanel symbols={symbols} />
      <SetupChecklist />
      {picmonic && symbols.length === 0 && box.scale > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center"
        >
          <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-4 py-2 backdrop-blur-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Drag a symbol from the library to start outlining
            </span>
          </div>
        </div>
      )}
      <SymbolContextMenu />
      <StageContextMenu />
      <ReplaceSymbolPopover />
    </div>
  );
}

const EMPTY_SYMBOLS = [] as const;

function CornerReadout({
  scale,
  zoom,
  symbolCount,
}: {
  scale: number;
  zoom: number;
  symbolCount: number;
}) {
  const pct = scale > 0 ? Math.round(scale * zoom * 100) : null;
  return (
    <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
      {symbolCount > 0 && (
        <>
          <span className="text-muted-foreground/80">{symbolCount} outline{symbolCount === 1 ? "" : "s"}</span>
          <span className="text-muted-foreground/30">·</span>
        </>
      )}
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
