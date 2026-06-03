"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Rect, Shape, Stage } from "react-konva";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@/lib/constants";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import { useStore } from "@/lib/store";
import { usePicmonic } from "@/lib/store/hooks";
import { getFactAnchor } from "@/lib/canvas/centroid";
import { parseNotes } from "@/lib/notes/parse";
import { getOrderedFacts } from "@/lib/notes/fact-order";
import type { FactHotspots, SymbolLayer } from "@/lib/types/canvas";
import { BackdropLayer } from "../canvas/backdrop-layer";
import { DotGrid } from "../canvas/dot-grid";
import { SymbolNode } from "../canvas/symbol-node";
import { HotspotCircle } from "./hotspot-circle";
import { HotspotRevealCard } from "./hotspot-reveal-card";
import {
  HotspotContextMenu,
  type HotspotContextMenuState,
} from "./hotspot-context-menu";

const STAGE_FALLBACK = "oklch(0.105 0 0)";

interface FitBox {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

const ZERO_BOX: FitBox = { width: 0, height: 0, scale: 0, offsetX: 0, offsetY: 0 };

export function PlayerStage() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<Konva.Stage | null>(null);
  const [box, setBox] = React.useState<FitBox>(ZERO_BOX);
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });
  const stageFill = useThemedCssVar("--stage", STAGE_FALLBACK) ?? STAGE_FALLBACK;

  const picmonic = usePicmonic();
  const symbols = picmonic?.canvas.symbols ?? EMPTY_SYMBOLS;
  const factHotspots = picmonic?.canvas.factHotspots ?? EMPTY_HOTSPOTS;
  const backdrop = picmonic?.canvas.backdrop ?? null;
  const notes = picmonic?.notes ?? "";

  const player = useStore((s) => s.player);
  const revealFact = useStore((s) => s.revealFact);
  const closeReveal = useStore((s) => s.closeReveal);
  const setHotspotOverride = useStore((s) => s.setHotspotOverride);
  const clearHotspotOverride = useStore((s) => s.clearHotspotOverride);

  const parsed = React.useMemo(() => parseNotes(notes), [notes]);
  const orderedFacts = React.useMemo(
    () => getOrderedFacts(parsed),
    [parsed],
  );

  // Map factId → { ordinal, anchor }. Skips facts with no anchor (no symbols).
  const hotspots = React.useMemo(() => {
    const out: { factId: string; ordinal: number; x: number; y: number }[] = [];
    for (let i = 0; i < orderedFacts.length; i++) {
      const fact = orderedFacts[i];
      const anchor = getFactAnchor(fact.factId, parsed, symbols, factHotspots);
      if (!anchor) continue;
      out.push({ factId: fact.factId, ordinal: i + 1, x: anchor.x, y: anchor.y });
    }
    return out;
  }, [orderedFacts, parsed, symbols, factHotspots]);

  // Resolve "current fact" — Hotspot mode uses revealedFactId, Sequential
  // uses orderedFacts[sequentialIndex].
  const currentFactId = React.useMemo(() => {
    if (player.mode === "hotspot") return player.revealedFactId;
    if (player.mode === "sequential") {
      const f = orderedFacts[player.sequentialIndex];
      return f?.factId ?? null;
    }
    return null;
  }, [player.mode, player.revealedFactId, player.sequentialIndex, orderedFacts]);

  // For glow/dim: which symbol IDs are linked to the current fact?
  const currentLinkedSymbolIds = React.useMemo(() => {
    if (!currentFactId) return EMPTY_SYMBOL_ID_SET;
    const fact = parsed.factsById.get(currentFactId);
    if (!fact) return EMPTY_SYMBOL_ID_SET;
    return new Set(fact.symbolRefs.map((r) => r.symbolId));
  }, [currentFactId, parsed]);

  // Region layers belonging to the active fact — these drive the backdrop
  // spotlight. Empty when the fact has no regions, in which case the
  // overlay layer isn't rendered and Study mode looks identical to today.
  const linkedRegions = React.useMemo(() => {
    if (currentLinkedSymbolIds.size === 0) return EMPTY_REGION_LIST;
    const out = symbols.filter(
      (s) => s.kind === "region" && currentLinkedSymbolIds.has(s.id),
    );
    return out.length === 0 ? EMPTY_REGION_LIST : out;
  }, [symbols, currentLinkedSymbolIds]);

  const showSpotlight = !!currentFactId && linkedRegions.length > 0;

  // Smooth the spotlight on/off — instant pop reads as harsh, fade reads
  // as cinematic. 240ms ease-out matches the existing reveal-card timing
  // so they arrive together when a hotspot is clicked.
  const spotlightOpacity = useFadeOpacity(showSpotlight, 240);

  const [contextMenu, setContextMenu] =
    React.useState<HotspotContextMenuState | null>(null);

  // Fit-to-viewport observer — mirrors canvas-stage.tsx
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
      // clientWidth/Height = padding box (matches CSS absolute-positioning
      // containing block). The reveal card uses this for smart-flip clamping.
      const innerW = el.clientWidth;
      const innerH = el.clientHeight;
      setContainerSize((prev) => {
        if (
          Math.abs(prev.width - innerW) < 0.5 &&
          Math.abs(prev.height - innerH) < 0.5
        ) {
          return prev;
        }
        return { width: innerW, height: innerH };
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

  const noopMount = React.useCallback(() => {
    /* PlayerStage doesn't need refs to symbol nodes */
  }, []);

  const handleHotspotClick = React.useCallback(
    (factId: string) => {
      if (player.mode !== "hotspot") return;
      if (player.revealedFactId === factId) {
        closeReveal();
        return;
      }
      revealFact(factId);
    },
    [player.mode, player.revealedFactId, revealFact, closeReveal],
  );

  const handleHotspotContextMenu = React.useCallback(
    (factId: string, sx: number, sy: number) => {
      const isOverride = !!factHotspots[factId]?.userOverride;
      setContextMenu({ factId, isOverride, x: sx, y: sy });
    },
    [factHotspots],
  );

  const handleHotspotDragEnd = React.useCallback(
    (factId: string, x: number, y: number) => {
      const clamped = {
        x: Math.max(0, Math.min(STAGE_WIDTH, x)),
        y: Math.max(0, Math.min(STAGE_HEIGHT, y)),
      };
      setHotspotOverride(factId, clamped.x, clamped.y);
    },
    [setHotspotOverride],
  );

  // Konva mousedown on the Stage handles canvas-internal dismissal.
  // - Click/drag on a hotspot → its Group is the ancestor, skip dismiss
  //   (the hotspot's own click handler manages reveal toggling; drag keeps
  //   the card open without re-firing).
  // - Click on the paper background or on a symbol (which is listening:false
  //   in player mode, so the click hits the Stage with target === Stage) →
  //   dismiss.
  const handleStageMouseDown = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (player.mode !== "hotspot") return;
      if (!player.revealedFactId) return;
      const ancestor = e.target.findAncestor("Group", true);
      if (ancestor && ancestor.name() === "hotspot") return;
      closeReveal();
    },
    [player.mode, player.revealedFactId, closeReveal],
  );

  // Document-level mousedown handles dismissal for clicks OUTSIDE the canvas
  // (topbar, dark margins). Clicks inside the canvas are routed to Konva and
  // handled by `handleStageMouseDown` instead — we explicitly skip them here
  // so a hotspot mousedown (drag start) doesn't trigger a duplicate dismiss.
  React.useEffect(() => {
    if (player.mode !== "hotspot") return;
    if (!player.revealedFactId) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".eng-hotspot-card")) return;
      // Konva renders to <canvas>; routing those to the Stage handler.
      if (target instanceof HTMLCanvasElement) return;
      closeReveal();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [player.mode, player.revealedFactId, closeReveal]);

  // Active reveal-card data (Hotspot mode only)
  const revealData = React.useMemo(() => {
    if (player.mode !== "hotspot" || !player.revealedFactId) return null;
    const fact = parsed.factsById.get(player.revealedFactId);
    if (!fact) return null;
    const hs = hotspots.find((h) => h.factId === player.revealedFactId);
    if (!hs) return null;
    return { fact, ordinal: hs.ordinal, world: { x: hs.x, y: hs.y } };
  }, [player.mode, player.revealedFactId, parsed, hotspots]);

  // Anchor for the reveal card in CONTAINER pixels (relative to PlayerStage).
  const revealAnchor = React.useMemo(() => {
    if (!revealData || box.scale === 0) return null;
    return {
      x: box.offsetX + revealData.world.x * box.scale,
      y: box.offsetY + revealData.world.y * box.scale,
    };
  }, [revealData, box]);

  const showHotspots = player.mode === "hotspot";

  return (
    <div ref={containerRef} className="eng-player-stage-host">
      {box.scale > 0 && (
        <div
          className="eng-player-stage-paper"
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
                fill={stageFill}
              />
              <DotGrid />
            </Layer>
            {backdrop && backdrop.uploadedBlobId && (
              <BackdropLayer backdrop={backdrop} />
            )}
            {(showSpotlight || spotlightOpacity > 0) && (
              <Layer listening={false} opacity={spotlightOpacity}>
                <Shape
                  sceneFunc={(ctx) => {
                    // Outer stage rect — drawn first.
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(STAGE_WIDTH, 0);
                    ctx.lineTo(STAGE_WIDTH, STAGE_HEIGHT);
                    ctx.lineTo(0, STAGE_HEIGHT);
                    ctx.closePath();
                    // Each linked region adds an inner subpath. With the
                    // evenodd fill rule, every odd-depth area is filled and
                    // every even-depth area is left transparent — so the
                    // polygons "punch holes" through the dimming rectangle
                    // and the backdrop pixels under them stay bright.
                    for (const r of linkedRegions) {
                      const pts = r.polygon ?? [];
                      if (pts.length < 3) continue;
                      ctx.moveTo(pts[0].x, pts[0].y);
                      for (let i = 1; i < pts.length; i++) {
                        ctx.lineTo(pts[i].x, pts[i].y);
                      }
                      ctx.closePath();
                    }
                    ctx.fillStyle = "rgba(0,0,0,0.78)";
                    // Konva.Context wraps the native 2d context; the
                    // `_context` escape hatch lets us pass the fill rule.
                    const native = (ctx as unknown as {
                      _context: CanvasRenderingContext2D;
                    })._context;
                    native.fill("evenodd");
                  }}
                  perfectDrawEnabled={false}
                  listening={false}
                />
              </Layer>
            )}
            <Layer>
              {symbols.map((layer) => {
                const isLinked = currentLinkedSymbolIds.has(layer.id);
                const dim =
                  player.mode === "sequential" && !isLinked ? 0.22 : 1;
                const glowing = !!currentFactId && isLinked;
                return (
                  <SymbolNode
                    key={layer.id}
                    layer={layer}
                    selected={false}
                    glowing={glowing}
                    onMount={noopMount}
                    interactive={false}
                    dimFactor={dim}
                  />
                );
              })}
            </Layer>
            {showHotspots && (
              <Layer>
                {hotspots.map((h) => (
                  <HotspotCircle
                    key={h.factId}
                    factId={h.factId}
                    ordinal={h.ordinal}
                    x={h.x}
                    y={h.y}
                    isActive={player.revealedFactId === h.factId}
                    isOverride={!!factHotspots[h.factId]?.userOverride}
                    onClick={handleHotspotClick}
                    onContextMenu={handleHotspotContextMenu}
                    onDragEnd={handleHotspotDragEnd}
                  />
                ))}
              </Layer>
            )}
          </Stage>
        </div>
      )}
      {revealData && revealAnchor && containerSize.width > 0 && (
        <HotspotRevealCard
          fact={revealData.fact}
          ordinal={revealData.ordinal}
          notes={notes}
          canvasSymbols={symbols}
          anchor={revealAnchor}
          viewport={containerSize}
        />
      )}
      <HotspotContextMenu
        state={contextMenu}
        onResetPosition={(factId) => clearHotspotOverride(factId)}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}

const EMPTY_SYMBOLS: readonly SymbolLayer[] = [];
const EMPTY_HOTSPOTS: FactHotspots = {};
const EMPTY_SYMBOL_ID_SET = new Set<string>();
const EMPTY_REGION_LIST: readonly SymbolLayer[] = [];

/**
 * Tween a boolean to an opacity value using rAF — toggling `target` ramps
 * the returned value 0↔1 across `durationMs` with an ease-out curve. Used
 * to fade the Study-mode spotlight on and off.
 */
function useFadeOpacity(target: boolean, durationMs: number): number {
  const [opacity, setOpacity] = React.useState(target ? 1 : 0);
  const rafRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number | null>(null);
  const fromRef = React.useRef(target ? 1 : 0);
  const toRef = React.useRef(target ? 1 : 0);

  React.useEffect(() => {
    fromRef.current = opacity;
    toRef.current = target ? 1 : 0;
    if (fromRef.current === toRef.current) return;
    startRef.current = null;
    const tick = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      // Ease-out cubic — fast start, soft landing.
      const eased = 1 - Math.pow(1 - t, 3);
      const next =
        fromRef.current + (toRef.current - fromRef.current) * eased;
      setOpacity(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // We deliberately exclude `opacity` so the effect only re-fires when
    // the target flips — re-firing on every interim opacity update would
    // restart the tween mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return opacity;
}
