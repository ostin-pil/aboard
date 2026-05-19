"use client";

import { Panel, useStore } from "@xyflow/react";
import { LAYOUT } from "./engine-to-rf";

// Fixed left-margin band labels for the three semantic rows. Rendered inside
// a non-panning <Panel> so the label text stays screen-fixed (it does NOT
// scale with zoom). Only the vertical position tracks the live viewport
// transform [tx, ty, zoom] so each label stays glued to its row band as the
// user pans / zooms. Fullbleed only — inline mode passes through nothing.

const ROWS: { row: 1 | 2 | 3; label: string }[] = [
  { row: 1, label: "SYMPTOMS" },
  { row: 2, label: "MECHANISMS" },
  { row: 3, label: "LEVERAGE" },
];

// Nudge the label down from the row's top Y toward a typical card's vertical
// midline so it reads as a band marker, not a ceiling tick.
const CARD_MID_OFFSET = 46;

export function RowLabels() {
  const transform = useStore((s) => s.transform);
  const [, ty, zoom] = transform;
  const rowY = LAYOUT.fullbleed.rowY;

  return (
    <Panel position="top-left" className="ag-row-labels">
      {ROWS.map(({ row, label }) => {
        const y = ty + (rowY[row] + CARD_MID_OFFSET) * zoom;
        return (
          <span
            key={row}
            className="ag-row-label"
            style={{ transform: `translateY(${y}px)` }}
          >
            {label}
          </span>
        );
      })}
    </Panel>
  );
}
