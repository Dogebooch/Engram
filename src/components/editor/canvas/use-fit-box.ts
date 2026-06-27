import * as React from "react";
import { computeFitBox, ZERO_BOX, type FitBox } from "@/lib/canvas/fit-box";

/**
 * Observe a container element and keep a letterboxed {@link FitBox} for the
 * fixed 1920×1080 stage. Shared by the editor canvas and the player stage.
 *
 * `onContainerSize` (optional) receives the container's padding-box size on
 * every resize — the player uses it for reveal-card smart-flip clamping. Pass
 * a stable callback (e.g. `useCallback`) so the observer isn't torn down each
 * render.
 */
export function useFitBox(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onContainerSize?: (size: { width: number; height: number }) => void,
): FitBox {
  const [box, setBox] = React.useState<FitBox>(ZERO_BOX);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const apply = (cw: number, ch: number) => {
      const next = computeFitBox(cw, ch);
      setBox((prev) =>
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      );
      // clientWidth/Height = padding box (matches the CSS absolute-positioning
      // containing block the reveal card flips against).
      onContainerSize?.({ width: el.clientWidth, height: el.clientHeight });
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
  }, [containerRef, onContainerSize]);

  return box;
}
