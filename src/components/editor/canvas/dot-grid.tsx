"use client";

import * as React from "react";
import { Circle, Group } from "react-konva";
import {
  GRID_DOT_RADIUS,
  GRID_SPACING,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "@/lib/constants";

const DOT_FILL = "#3f3f3f";

export const DotGrid = React.memo(function DotGrid() {
  const dots = React.useMemo(() => {
    const cols = Math.floor(STAGE_WIDTH / GRID_SPACING);
    const rows = Math.floor(STAGE_HEIGHT / GRID_SPACING);
    const out: React.ReactElement[] = [];
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        out.push(
          <Circle
            key={`${r}:${c}`}
            x={c * GRID_SPACING}
            y={r * GRID_SPACING}
            radius={GRID_DOT_RADIUS}
            fill={DOT_FILL}
            perfectDrawEnabled={false}
            listening={false}
          />,
        );
      }
    }
    return out;
  }, []);

  return <Group listening={false}>{dots}</Group>;
});
