"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ClaimEdge } from "./types";

type Props = {
  edge: ClaimEdge;
  anchor: HTMLElement | SVGElement;
  cursor?: { clientX: number; clientY: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export function EdgePopover({
  edge,
  anchor,
  cursor,
  containerRef,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = containerRef.current;
    if (!wrap || !ref.current) return;
    const wrapRect = wrap.getBoundingClientRect();
    const popW = ref.current.offsetWidth || 280;
    const popH = ref.current.offsetHeight || 120;
    const useCursor = cursor && anchor.tagName.toLowerCase() === "path";
    let anchorX: number;
    let anchorY: number;
    let anchorRight: number;
    if (useCursor) {
      anchorX = cursor.clientX;
      anchorY = cursor.clientY;
      anchorRight = cursor.clientX;
    } else {
      const r = anchor.getBoundingClientRect();
      anchorX = r.left;
      anchorY = r.top + r.height / 2;
      anchorRight = r.right;
    }
    let left = anchorRight - wrapRect.left + 12;
    let top = anchorY - wrapRect.top - popH / 2;
    if (left + popW > wrapRect.width - 8) {
      left = anchorX - wrapRect.left - popW - 12;
    }
    if (top < 8) top = 8;
    if (top + popH > wrapRect.height - 8) top = wrapRect.height - popH - 8;
    setPos({ left: Math.max(8, left), top });
  }, [anchor, cursor, containerRef]);

  const data = edge.data!;
  const sources = data.sources ?? [];

  return (
    <div
      ref={ref}
      className="ag-edge-popover"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // Focus does for the keyboard what hover does for the pointer, including
      // the close it schedules on leaving. Without the focus half, moving into
      // the panel to reach its source links blurs the edge and closes the panel
      // under the focus that just arrived. `tabIndex` is what makes that move
      // possible at all; the panel is not itself a tab stop.
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
      tabIndex={-1}
      role="group"
      aria-label={`${edge.source} ${edge.data?.kind ?? "causes"} ${edge.target}, rationale`}
      style={{
        position: "absolute",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
        zIndex: 50,
      }}
    >
      <div className="ag-edge-pop-head">
        {edge.source} <span className="arrow">→</span> {edge.target}{" "}
        <span className={`kind ag-${data.kind}`}>{data.kind}</span>
      </div>
      {data.rationale && <div className="ag-edge-pop-rationale">{data.rationale}</div>}
      {sources.length > 0 && (
        <ul className="ag-edge-pop-sources">
          {sources.map((s, i) => {
            const meta = [s.kind].filter(Boolean).join(" · ");
            return (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener">
                  {s.label}
                </a>
                {meta && <span className="meta"> {meta}</span>}
                {s.finding && <div className="finding">{s.finding}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
