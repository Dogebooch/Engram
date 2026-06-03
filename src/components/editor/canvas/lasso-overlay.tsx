"use client";

import * as React from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Line } from "react-konva";
import { toast } from "sonner";
import {
  addRegionFromPolygon,
  replaceRegionPolygon,
} from "@/lib/canvas/add-symbol-with-note-sync";
import { finalizeLassoPolygon } from "@/lib/canvas/simplify-polygon";
import { useStore } from "@/lib/store";
import { useThemedCssVar } from "@/lib/theme/use-themed-css-var";
import type { PolygonPoint } from "@/lib/types/canvas";

const ACCENT_FALLBACK = "oklch(0.78 0.13 75)";

interface LassoOverlayProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  /** Stage scale — used to keep the dashed stroke a constant pixel width. */
  stageScale: number;
}

/**
 * Pointer-tracking overlay rendered only while `ui.canvasTool === "lasso"`.
 * Captures pointer events on the stage, accumulates a freehand path, and on
 * release routes the simplified polygon through the same add-symbol pipeline
 * a library symbol uses (so notes/canvas/undo all stay coherent).
 */
export function LassoOverlay({ stageRef, stageScale }: LassoOverlayProps) {
  const setCanvasTool = useStore((s) => s.setCanvasTool);
  const setRetraceTargetId = useStore((s) => s.setRetraceTargetId);
  const accent = useThemedCssVar("--accent", ACCENT_FALLBACK) ?? ACCENT_FALLBACK;

  const [draftPoints, setDraftPoints] = React.useState<PolygonPoint[]>([]);
  const draftRef = React.useRef<PolygonPoint[]>([]);
  const tracingRef = React.useRef(false);

  const stageLocalFromClient = React.useCallback(
    (clientX: number, clientY: number): PolygonPoint | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const r = stage.container().getBoundingClientRect();
      const sc = stage.scaleX() || 1;
      return { x: (clientX - r.left) / sc, y: (clientY - r.top) / sc };
    },
    [stageRef],
  );

  const cancelDraft = React.useCallback(() => {
    tracingRef.current = false;
    draftRef.current = [];
    setDraftPoints([]);
  }, []);

  const handleStartTrace = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;
      const local = stageLocalFromClient(e.evt.clientX, e.evt.clientY);
      if (!local) return;
      tracingRef.current = true;
      draftRef.current = [local];
      setDraftPoints([local]);
    },
    [stageLocalFromClient],
  );

  React.useEffect(() => {
    if (!tracingRef.current && draftPoints.length === 0) return;

    const onMove = (ev: MouseEvent) => {
      if (!tracingRef.current) return;
      const local = stageLocalFromClient(ev.clientX, ev.clientY);
      if (!local) return;
      const last = draftRef.current[draftRef.current.length - 1];
      // Skip sub-pixel jitter so we don't accumulate near-duplicate points.
      if (last) {
        const dx = local.x - last.x;
        const dy = local.y - last.y;
        if (dx * dx + dy * dy < 0.25) return;
      }
      draftRef.current.push(local);
      setDraftPoints(draftRef.current.slice());
    };

    const finishTrace = () => {
      if (!tracingRef.current) return;
      tracingRef.current = false;
      const raw = draftRef.current;
      draftRef.current = [];
      setDraftPoints([]);
      if (raw.length < 2) return;
      const result = finalizeLassoPolygon(raw);
      if (!result.ok) {
        if (result.reason === "too-small") {
          toast.error("Lasso too small", {
            description: "Trace a larger area to define a region.",
          });
        }
        return;
      }
      const polygon = result.polygon!;
      const targetId = useStore.getState().ui.retraceTargetId;
      if (targetId) {
        replaceRegionPolygon(targetId, polygon);
        setRetraceTargetId(null);
        toast.success("Region re-traced");
      } else {
        const id = addRegionFromPolygon(polygon);
        if (!id) {
          toast.error("Couldn't add region", {
            description: "No active Picmonic.",
          });
          return;
        }
      }
      // Drop back to select so the user can immediately edit/describe the
      // region they just lassoed.
      setCanvasTool("select");
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", finishTrace);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", finishTrace);
    };
  }, [draftPoints.length, setCanvasTool, setRetraceTargetId, stageLocalFromClient]);

  // Esc cancels an in-flight trace; a second Esc exits lasso mode entirely.
  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (tracingRef.current) {
        ev.stopPropagation();
        cancelDraft();
        return;
      }
      ev.stopPropagation();
      setRetraceTargetId(null);
      setCanvasTool("select");
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [cancelDraft, setCanvasTool, setRetraceTargetId]);

  // Stage cursor → crosshair while the lasso is mounted.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    const previous = container.style.cursor;
    container.style.cursor = "crosshair";
    return () => {
      container.style.cursor = previous;
    };
  }, [stageRef]);

  const flatPoints = React.useMemo(() => {
    const out: number[] = [];
    for (const p of draftPoints) {
      out.push(p.x, p.y);
    }
    return out;
  }, [draftPoints]);

  const strokePx = stageScale > 0 ? 2 / stageScale : 2;
  const dashPx = stageScale > 0 ? 6 / stageScale : 6;

  return (
    <Layer>
      {/*
        Invisible full-stage rect via a Line spanning the stage corners would
        be brittle; instead we attach pointerdown to the Stage via onMouseDown
        on a transparent Line that fills the layer — but Konva doesn't size
        a Layer like a Rect. Use a transparent Rect-shaped Line is hacky.
        Simpler: attach pointerdown via the parent Stage's onMouseDown, which
        the parent (canvas-stage) already routes to us.
      */}
      {draftPoints.length > 0 && (
        <Line
          points={flatPoints}
          stroke={accent}
          strokeWidth={strokePx}
          dash={[dashPx, dashPx]}
          lineCap="round"
          lineJoin="round"
          listening={false}
          closed={false}
          fillEnabled={false}
          perfectDrawEnabled={false}
        />
      )}
      {/* Sentinel: when the layer is mounted we expose handleStartTrace via
          a ref so the parent Stage can fire it on mousedown. */}
      <LassoMounter onStart={handleStartTrace} />
    </Layer>
  );
}

/**
 * Bridge component: registers the lasso's pointerdown handler with the
 * module-scoped slot so canvas-stage can invoke it without prop drilling
 * through Konva's render tree.
 */
function LassoMounter({
  onStart,
}: {
  onStart: (e: KonvaEventObject<MouseEvent>) => void;
}) {
  React.useEffect(() => {
    activeLassoStartHandler = onStart;
    return () => {
      if (activeLassoStartHandler === onStart) activeLassoStartHandler = null;
    };
  }, [onStart]);
  return null;
}

let activeLassoStartHandler:
  | ((e: KonvaEventObject<MouseEvent>) => void)
  | null = null;

/**
 * Called by the Stage's onMouseDown when the lasso tool is active. Returns
 * true if the lasso consumed the event and the Stage should skip its own
 * marquee/select handling.
 */
export function dispatchLassoStart(e: KonvaEventObject<MouseEvent>): boolean {
  if (!activeLassoStartHandler) return false;
  activeLassoStartHandler(e);
  return true;
}
