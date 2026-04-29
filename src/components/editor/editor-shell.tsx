"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PANEL_DEFAULTS } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { useDebouncedPicmonicSave } from "@/lib/store/debounced-save";
import { useCurrentPicmonicId, useUiPrefs } from "@/lib/store/hooks";
import { useEditorKeybindings } from "@/lib/keybindings";
import { CanvasErrorBoundary } from "./error-boundary";
import { EmptyState } from "./empty-state";
import { LeftPanel } from "./panels/left-panel";
import { RightPanel } from "./panels/right-panel";
import { Topbar } from "./topbar";

const CanvasStage = dynamic(
  () => import("./canvas/canvas-stage").then((m) => m.CanvasStage),
  {
    ssr: false,
    loading: () => <CanvasFallback />,
  },
);

export function EditorShell() {
  useDebouncedPicmonicSave();
  useEditorKeybindings();

  const ui = useUiPrefs();
  const currentId = useCurrentPicmonicId();
  const setLeftPanelSize = useStore((s) => s.setLeftPanelSize);
  const setRightPanelSize = useStore((s) => s.setRightPanelSize);
  const setLeftCollapsed = useStore((s) => s.setLeftCollapsed);
  const setRightCollapsed = useStore((s) => s.setRightCollapsed);

  const leftRef = usePanelRef();
  const rightRef = usePanelRef();

  useSyncCollapse(leftRef, ui.leftCollapsed);
  useSyncCollapse(rightRef, ui.rightCollapsed);

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel
            id="library"
            panelRef={leftRef}
            defaultSize={`${ui.leftPanelSize}%`}
            minSize={`${PANEL_DEFAULTS.leftMin}%`}
            maxSize={`${PANEL_DEFAULTS.leftMax}%`}
            collapsible
            collapsedSize="0%"
            onResize={(size) => {
              const pct = size.asPercentage;
              if (pct <= 0.5) {
                if (!useStore.getState().ui.leftCollapsed) setLeftCollapsed(true);
              } else {
                if (useStore.getState().ui.leftCollapsed) setLeftCollapsed(false);
                if (Math.abs(pct - useStore.getState().ui.leftPanelSize) > 0.25) {
                  setLeftPanelSize(pct);
                }
              }
            }}
          >
            <LeftPanel />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel
            id="canvas"
            minSize={`${PANEL_DEFAULTS.centerMin}%`}
          >
            <CanvasErrorBoundary>
              {currentId ? <CanvasStage /> : <EmptyState />}
            </CanvasErrorBoundary>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel
            id="notes"
            panelRef={rightRef}
            defaultSize={`${ui.rightPanelSize}%`}
            minSize={`${PANEL_DEFAULTS.rightMin}%`}
            maxSize={`${PANEL_DEFAULTS.rightMax}%`}
            collapsible
            collapsedSize="0%"
            onResize={(size) => {
              const pct = size.asPercentage;
              if (pct <= 0.5) {
                if (!useStore.getState().ui.rightCollapsed) setRightCollapsed(true);
              } else {
                if (useStore.getState().ui.rightCollapsed) setRightCollapsed(false);
                if (Math.abs(pct - useStore.getState().ui.rightPanelSize) > 0.25) {
                  setRightPanelSize(pct);
                }
              }
            }}
          >
            <RightPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function useSyncCollapse(
  ref: React.RefObject<PanelImperativeHandle | null>,
  collapsed: boolean,
) {
  React.useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const isCollapsed = panel.isCollapsed();
    if (collapsed && !isCollapsed) panel.collapse();
    else if (!collapsed && isCollapsed) panel.expand();
  }, [ref, collapsed]);
}

function CanvasFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-stage">
      <div className="aspect-[16/9] w-3/4 max-w-5xl animate-pulse rounded-md border border-border/40 bg-stage/60" />
    </div>
  );
}
