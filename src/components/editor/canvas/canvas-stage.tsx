"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { ShapesIcon } from "lucide-react";
import { Layer, Line, Rect, Stage } from "react-konva";
import { Button } from "@/components/ui/button";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import {
  marqueeHitTest,
  normalizeRect,
  type Rect as MarqueeRect,
} from "@/lib/canvas/marquee-hit-test";
import { toast } from "sonner";
import { addRegionWithNoteSync } from "@/lib/canvas/add-symbol-with-note-sync";
import { describeSymbol } from "@/lib/canvas/missing-outlines";
import { parseNotes } from "@/lib/notes/parse";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import type { OutlineWalkthroughState } from "@/lib/store/slices/interactions-slice";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import type { RegionPoint } from "@/lib/types/canvas";
import { BackdropLayer } from "./backdrop-layer";
import { CanvasTransformer } from "./canvas-transformer";
import { DescribePopover } from "./describe-popover";
import { setCurrentStage } from "./canvas-stage-ref";
import { DotGrid } from "./dot-grid";
import { ReplaceSymbolPopover } from "./replace-symbol-popover";
import { StageContextMenu } from "./stage-context-menu";
import { SymbolContextMenu } from "./symbol-context-menu";
import { SymbolNode } from "./symbol-node";
import { useCanvasFileDrop } from "./use-canvas-file-drop";
import { useCanvasDrop } from "./use-canvas-drop";
import { useThumbnailCapture } from "./use-thumbnail-capture";

// Konva fallback for SSR / first-paint before CSS variables resolve. Matches the
// dark-mode `--stage` token so the unflashed render is indistinguishable.
const STAGE_PAPER_FALLBACK = "oklch(0.255 0.025 188)";

const MARQUEE_DRAG_THRESHOLD = 4;
const REGION_DRAG_THRESHOLD = 4;
const REGION_SAMPLE_DISTANCE = 8;

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

type RegionDraftState =
  | { kind: "idle" }
  | { kind: "active"; points: RegionPoint[]; hover: RegionPoint | null };

const IDLE_REGION_DRAFT: RegionDraftState = { kind: "idle" };

// Module-scoped cancel hook so the global Escape handler in keybindings.ts
// can abort an in-flight marquee without prop drilling.
let marqueeCancelHandler: (() => boolean) | null = null;
let regionDraftCancelHandler: (() => boolean) | null = null;

export function cancelMarqueeIfActive(): boolean {
  return marqueeCancelHandler ? marqueeCancelHandler() : false;
}

export function cancelRegionDraftIfActive(): boolean {
  return regionDraftCancelHandler ? regionDraftCancelHandler() : false;
}

function clampStageX(x: number): number {
  return Math.max(0, Math.min(STAGE_WIDTH, x));
}

function clampStageY(y: number): number {
  return Math.max(0, Math.min(STAGE_HEIGHT, y));
}

function closePolygonPoints(points: readonly RegionPoint[]): {
  x: number;
  y: number;
  width: number;
  height: number;
  points: RegionPoint[];
} | null {
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 8 || height < 8) return null;
  return {
    x: minX,
    y: minY,
    width,
    height,
    points: points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
  };
}

function samePoint(a: RegionPoint, b: RegionPoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 3;
}

export function CanvasStage() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<Konva.Stage | null>(null);
  const symbolRefs = React.useRef<
    Map<string, Konva.Image | Konva.Rect | Konva.Line>
  >(new Map());
  const [box, setBox] = React.useState<FitBox>(ZERO_BOX);

  const picmonic = usePicmonic();
  const symbols = picmonic?.canvas.symbols ?? EMPTY_SYMBOLS;
  const backdrop = picmonic?.canvas.backdrop ?? null;
  const stageFill = useThemedCssVar("--stage", STAGE_PAPER_FALLBACK) ?? STAGE_PAPER_FALLBACK;
  const accent = useThemedCssVar("--accent", "oklch(0.68 0.095 52)") ?? "oklch(0.68 0.095 52)";
  const selectedIds = useStore((s) => s.selectedSymbolIds);
  const cursorSymbolIds = useStore((s) => s.cursorSymbolIds);
  const annotationMode = useStore((s) => s.annotationMode);
  const outlineTargetId = useStore((s) => s.outlineTargetSymbolId);
  const outlineWalkthrough = useStore((s) => s.outlineWalkthrough);
  const clearSelection = useStore((s) => s.clearSelection);
  const setSelectedSymbolIds = useStore((s) => s.setSelectedSymbolIds);
  const setLibraryDrawerOpen = useStore((s) => s.setLibraryDrawerOpen);
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const hoveredSymbolId = useStore((s) => s.hoveredSymbolId);
  const glowSet = React.useMemo(() => {
    const set = new Set(cursorSymbolIds);
    if (hoveredSymbolId) set.add(hoveredSymbolId);
    return set;
  }, [cursorSymbolIds, hoveredSymbolId]);

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
  const { fileHover } = useCanvasFileDrop({ stageRef, containerRef });
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
    (id: string, node: Konva.Image | Konva.Rect | Konva.Line | null) => {
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

  const regionDraftRef = React.useRef<RegionDraftState>(IDLE_REGION_DRAFT);
  const regionDragRef = React.useRef<{
    down: RegionPoint;
    last: RegionPoint;
    drawing: boolean;
  } | null>(null);
  const [regionDraft, setRegionDraftState] =
    React.useState<RegionDraftState>(IDLE_REGION_DRAFT);
  const setRegionDraft = React.useCallback(
    (next: RegionDraftState | ((prev: RegionDraftState) => RegionDraftState)) => {
      const value =
        typeof next === "function"
          ? (next as (p: RegionDraftState) => RegionDraftState)(
              regionDraftRef.current,
            )
          : next;
      regionDraftRef.current = value;
      setRegionDraftState(value);
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

  const openStageContextMenu = useStore((s) => s.openStageContextMenu);

  const cancelRegionDraft = React.useCallback(() => {
    setRegionDraft(IDLE_REGION_DRAFT);
  }, [setRegionDraft]);

  const advanceWalkthrough = React.useCallback(() => {
    const status = useStore.getState().advanceOutlineWalkthrough();
    if (status === "done") toast("All symbols outlined", { duration: 1600 });
    return status;
  }, []);

  const closeRegionDraft = React.useCallback(() => {
    const draft = regionDraftRef.current;
    if (draft.kind !== "active") return false;
    const region = closePolygonPoints(draft.points);
    if (!region) return false;
    const s = useStore.getState();
    const targetId = s.outlineTargetSymbolId;
    if (targetId) {
      // Bind the outline to the existing bullet's symbol — no new bullet.
      if (!s.setSymbolOutline(targetId, { ...region, shape: "polygon" })) {
        return false;
      }
      const wt = s.outlineWalkthrough;
      if (wt && wt.queue[wt.index] === targetId) {
        advanceWalkthrough();
      } else {
        // Single-symbol flow — exit annotation mode once the one outline lands,
        // then open the describe popover so the user can caption it.
        s.setOutlineTarget(null);
        s.setAnnotationMode(false);
        s.openDescribePopover(targetId);
      }
    } else {
      // Free outline: mint a bullet and open the describe popover on it. Stay in
      // annotation mode so the next region can be drawn immediately.
      const newRegionId = addRegionWithNoteSync({ ...region, shape: "polygon" });
      if (newRegionId) s.openDescribePopover(newRegionId);
    }
    setRegionDraft(IDLE_REGION_DRAFT);
    return true;
  }, [advanceWalkthrough, setRegionDraft]);

  const handleStageContextMenu = React.useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      // Only fire for clicks on empty stage; per-symbol and Transformer
      // handlers stop propagation via cancelBubble.
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
      // Only react to primary button; right-click is consumed by the div
      // onContextMenu and per-symbol handlers.
      if (e.evt.button !== 0) return;
      const local = stageLocalFromClient(e.evt.clientX, e.evt.clientY);
      if (!local) return;
      if (annotationMode && backdrop?.uploadedBlobId) {
        if (e.evt.detail > 1) return;
        // Starting a new outline dismisses any open describe popover.
        useStore.getState().closeDescribePopover();
        const point = { x: clampStageX(local.x), y: clampStageY(local.y) };
        regionDragRef.current = { down: point, last: point, drawing: false };
        setRegionDraft((prev) => {
          if (prev.kind === "idle") {
            return { kind: "active", points: [point], hover: point };
          }
          const last = prev.points[prev.points.length - 1];
          if (last && samePoint(last, point)) return prev;
          return {
            kind: "active",
            points: [...prev.points, point],
            hover: point,
          };
        });
        return;
      }
      setMarquee({
        kind: "pending",
        downX: local.x,
        downY: local.y,
        shift: e.evt.shiftKey,
        baseSelection: useStore.getState().selectedSymbolIds.slice(),
      });
    },
    [
      annotationMode,
      backdrop?.uploadedBlobId,
      setMarquee,
      setRegionDraft,
      stageLocalFromClient,
    ],
  );

  const handleStageDoubleClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      if (!annotationMode || !backdrop?.uploadedBlobId) return;
      e.evt.preventDefault();
      closeRegionDraft();
    },
    [annotationMode, backdrop?.uploadedBlobId, closeRegionDraft],
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
  }, [
    marquee.kind,
    clearSelection,
    setMarquee,
    setSelectedSymbolIds,
    stageLocalFromClient,
  ]);

  React.useEffect(() => {
    if (!annotationMode && regionDraftRef.current.kind !== "idle") {
      setRegionDraft(IDLE_REGION_DRAFT);
    }
  }, [annotationMode, setRegionDraft]);

  // Resume an armed outline once a background image lands (the "no backdrop"
  // path: click chip → choose background → drop straight into drawing).
  React.useEffect(() => {
    if (outlineTargetId && backdrop?.uploadedBlobId && !annotationMode) {
      useStore.getState().startOutlineForSymbol(outlineTargetId);
    }
  }, [outlineTargetId, backdrop?.uploadedBlobId, annotationMode]);

  const notes = picmonic?.notes ?? "";
  const outlineLabel = React.useMemo(() => {
    if (!outlineTargetId) return null;
    return describeSymbol(notes, parseNotes(notes), outlineTargetId);
  }, [outlineTargetId, notes]);

  const handleOutlineDone = React.useCallback(() => {
    const s = useStore.getState();
    if (s.outlineWalkthrough) s.endOutlineWalkthrough();
    else {
      s.setOutlineTarget(null);
      s.setAnnotationMode(false);
    }
  }, []);

  React.useEffect(() => {
    if (regionDraft.kind === "idle") return;

    const onMove = (e: MouseEvent) => {
      const local = stageLocalFromClient(e.clientX, e.clientY);
      if (!local) return;
      const hover = { x: clampStageX(local.x), y: clampStageY(local.y) };
      const drag = regionDragRef.current;
      setRegionDraft((prev) => {
        if (prev.kind === "idle") return prev;
        if (drag && (e.buttons & 1) === 1) {
          const moved = Math.hypot(hover.x - drag.down.x, hover.y - drag.down.y);
          if (moved >= REGION_DRAG_THRESHOLD) drag.drawing = true;
          if (
            drag.drawing &&
            Math.hypot(hover.x - drag.last.x, hover.y - drag.last.y) >=
              REGION_SAMPLE_DISTANCE
          ) {
            drag.last = hover;
            return { ...prev, points: [...prev.points, hover], hover };
          }
        }
        return { ...prev, hover };
      });
    };

    const onUp = () => {
      const drag = regionDragRef.current;
      regionDragRef.current = null;
      if (!drag?.drawing) return;
      const closed = closeRegionDraft();
      if (!closed) cancelRegionDraft();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRegionDraft();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelRegionDraft();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [
    cancelRegionDraft,
    closeRegionDraft,
    regionDraft.kind,
    setRegionDraft,
    stageLocalFromClient,
  ]);

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
  }, [setMarquee]);

  React.useEffect(() => {
    regionDraftCancelHandler = () => {
      let cancelled = false;
      setRegionDraft((prev) => {
        if (prev.kind === "active") {
          cancelled = true;
          return IDLE_REGION_DRAFT;
        }
        return prev;
      });
      return cancelled;
    };
    return () => {
      regionDraftCancelHandler = null;
    };
  }, [setRegionDraft]);

  const symbolsKey = React.useMemo(
    () => symbols.map((s) => s.id).join("|"),
    [symbols],
  );

  // Marquee Rect props (only used while active).
  const marqueeRect: MarqueeRect | null =
    marquee.kind === "active"
      ? normalizeRect(marquee.startX, marquee.startY, marquee.endX, marquee.endY)
      : null;
  const regionDraftPreview =
    regionDraft.kind === "active"
      ? [
          ...regionDraft.points,
          ...(regionDraft.hover ? [regionDraft.hover] : []),
        ]
      : null;
  const regionDraftPreviewPoints =
    regionDraftPreview && regionDraftPreview.length > 1
      ? regionDraftPreview.flatMap((p) => [p.x, p.y])
      : null;
  const canAnnotate = annotationMode && !!backdrop?.uploadedBlobId;

  return (
    <div
      ref={containerRef}
      data-engram-canvas-root
      className="relative h-full w-full overflow-hidden bg-stage"
      data-annotation-mode={canAnnotate ? "" : undefined}
      style={{
        backgroundImage:
          "radial-gradient(ellipse at center, var(--stage-vignette-inner) 0%, var(--stage-vignette-outer) 70%)",
        cursor: canAnnotate ? "crosshair" : undefined,
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
          className="pointer-events-auto absolute rounded-[2px] shadow-[0_0_0_1px_color-mix(in_oklch,var(--border)_75%,transparent),0_24px_60px_-30px_color-mix(in_oklch,var(--background)_90%,transparent)] ring-1 ring-border/70 after:pointer-events-none after:absolute after:inset-0 after:rounded-[2px] after:opacity-0 after:transition-opacity after:duration-200 after:ease-out after:shadow-[inset_0_0_0_1px_var(--accent),inset_0_0_56px_-12px_var(--accent),0_0_0_1px_color-mix(in_oklch,var(--accent)_50%,transparent)] data-[drag-hover]:after:opacity-100"
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
            onDblClick={handleStageDoubleClick}
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
            <Layer name="region-draft" listening={false}>
              {regionDraft.kind === "active" && (
                <>
                  {regionDraftPreviewPoints &&
                    regionDraftPreview &&
                    regionDraftPreview.length >= 3 && (
                      <Line
                        points={regionDraftPreviewPoints}
                        closed
                        fill={accent}
                        opacity={0.06}
                        perfectDrawEnabled={false}
                      />
                    )}
                  {regionDraftPreviewPoints && (
                    <Line
                      points={regionDraftPreviewPoints}
                      stroke={accent}
                      strokeWidth={1.5 / box.scale}
                      dash={[6 / box.scale, 4 / box.scale]}
                      lineCap="round"
                      lineJoin="round"
                      opacity={0.95}
                      perfectDrawEnabled={false}
                    />
                  )}
                  {regionDraft.points.map((p, i) => (
                    <Rect
                      key={`region-point-${i}`}
                      x={p.x - 3 / box.scale}
                      y={p.y - 3 / box.scale}
                      width={6 / box.scale}
                      height={6 / box.scale}
                      fill={accent}
                      cornerRadius={1 / box.scale}
                      opacity={0.95}
                    />
                  ))}
                </>
              )}
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
              {backdrop?.uploadedBlobId ? "Add as symbol" : "Set as background"}
            </span>
          </div>
        </div>
      )}
      {annotationMode && (
        <AnnotationModeBadge
          canAnnotate={!!backdrop?.uploadedBlobId}
          outlineLabel={outlineLabel}
          walkthrough={outlineWalkthrough}
          onSkip={advanceWalkthrough}
          onDone={handleOutlineDone}
        />
      )}
      {box.scale > 0 && <DescribePopover box={box} />}
      {symbols.length === 0 &&
        !backdrop?.uploadedBlobId &&
        !annotationMode &&
        !fileHover && (
          <CanvasEmptyState onAddSymbol={() => setLibraryDrawerOpen(true)} />
        )}
      <CornerReadout scale={box.scale} />
      <SymbolContextMenu />
      <StageContextMenu />
      <ReplaceSymbolPopover />
    </div>
  );
}

const EMPTY_SYMBOLS = [] as const;

// Shown on a blank stage (no backdrop, no symbols). Names the two authoring
// paths — drop/paste an image to trace, or add a library symbol — so a fresh
// scene is never an unexplained void.
function CanvasEmptyState({ onAddSymbol }: { onAddSymbol: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="pointer-events-auto flex w-[min(30rem,86%)] flex-col items-center gap-5 rounded-xl border border-border/60 bg-card/70 px-8 py-9 text-center shadow-xl backdrop-blur-sm">
        <div className="flex flex-col items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
            New scene
          </span>
          <h2 className="text-lg font-medium text-foreground">Start your mnemonic</h2>
          <p className="max-w-[24rem] text-sm leading-relaxed text-muted-foreground">
            Drop or paste an image to set a background, then trace your symbols on
            it — or add a symbol from the library to build on a blank stage.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onAddSymbol} size="sm" aria-label="Add a symbol">
            <ShapesIcon />
            Add a symbol
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
            or drop / paste an image
          </span>
        </div>
      </div>
    </div>
  );
}

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

function AnnotationModeBadge({
  canAnnotate,
  outlineLabel,
  walkthrough,
  onSkip,
  onDone,
}: {
  canAnnotate: boolean;
  outlineLabel: string | null;
  walkthrough: OutlineWalkthroughState | null;
  onSkip: () => void;
  onDone: () => void;
}) {
  const label = !canAnnotate
    ? "Add background first"
    : outlineLabel
      ? `Outline: ${outlineLabel}`
      : "Click to outline a symbol";
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex max-w-[28rem] -translate-x-1/2 items-center gap-2 rounded-md border border-border/70 bg-card/90 px-2.5 py-1.5 shadow-lg backdrop-blur">
      <span className="max-w-[18rem] truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      {walkthrough && (
        <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-foreground/70">
          {walkthrough.index + 1} / {walkthrough.queue.length}
        </span>
      )}
      {walkthrough && (
        <button
          type="button"
          onClick={onSkip}
          className="pointer-events-auto shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/80 transition-colors hover:bg-foreground/[0.06]"
        >
          Skip
        </button>
      )}
      <button
        type="button"
        onClick={onDone}
        className="pointer-events-auto shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/80 transition-colors hover:bg-foreground/[0.06]"
      >
        Done
      </button>
    </div>
  );
}
