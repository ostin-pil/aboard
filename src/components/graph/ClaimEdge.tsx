"use client";

import { memo, useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useConnection,
  type EdgeProps,
} from "@xyflow/react";
import { EDGE_ARROWHEAD } from "./EdgeMarkers";
import { useGraphContext } from "./GraphContext";
import type { ClaimEdge as ClaimEdgeT } from "./types";

const connectingSelector = (c: { inProgress: boolean }) => c.inProgress;

// Keyed by `EngineEdge["kind"]`, which is the canonical `EdgeKind`. These are
// Records rather than lookups with a fallback on purpose: a new kind in
// `types.ts` fails the build here until it has been given ink, instead of
// rendering as an untyped default nobody notices.
const STROKE: Record<EngineEdge["kind"], string> = {
  causes: "var(--edge-causes)",
  moderates: "var(--edge-moderates)",
  reduces: "var(--edge-reduces)",
  evidences: "var(--edge-evidences)",
};

const DASH: Record<EngineEdge["kind"], string | undefined> = {
  causes: undefined,
  moderates: "3 3",
  reduces: "4 3",
  evidences: "1 3",
};

function ClaimEdgeImpl(props: EdgeProps<ClaimEdgeT>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    source,
    target,
  } = props;
  const ctx = useGraphContext();
  const isConnecting = useConnection(connectingSelector);
  const labelRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<SVGPathElement>(null);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const kind = data?.kind ?? "causes";
  const hasPopover = !!(data?.rationale || (data?.sources && data.sources.length > 0));
  const showLabel = ctx.mode === "fullbleed";
  const isNeighborhood =
    ctx.focusId !== null && (ctx.isNeighbor(source) && ctx.isNeighbor(target));
  const isDimmed = ctx.focusId !== null && !isNeighborhood;
  const outOfDomain = data?.outOfDomain;

  const onClick = (e: React.MouseEvent) => {
    if (!ctx.editable) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.openEdgeEditor({
      id,
      source,
      target,
      type: "claim",
      data: data!,
    });
  };

  const onLabelMouseEnter = () => {
    if (!hasPopover || isConnecting) return;
    ctx.cancelCloseEdgePopover();
    if (labelRef.current) {
      ctx.openEdgePopover(
        { id, source, target, type: "claim", data: data! },
        labelRef.current
      );
    }
  };

  const onPathMouseEnter = (ev: React.MouseEvent) => {
    if (!hasPopover || isConnecting) return;
    ctx.cancelCloseEdgePopover();
    if (hitRef.current) {
      ctx.openEdgePopover(
        { id, source, target, type: "claim", data: data! },
        hitRef.current,
        { clientX: ev.clientX, clientY: ev.clientY }
      );
    }
  };

  const onMouseLeave = () => {
    if (hasPopover) ctx.scheduleCloseEdgePopover();
  };

  const stroke = STROKE[kind];
  const dasharray = DASH[kind];
  const opacity = isDimmed || outOfDomain ? 0.18 : kind === "moderates" ? 0.85 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth: kind === "moderates" ? 1 : 1.1,
          strokeDasharray: dasharray,
          opacity,
        }}
        markerEnd={EDGE_ARROWHEAD[kind] ? `url(#ag-rf-ah-${kind})` : undefined}
      />
      {hasPopover && (
        <path
          ref={hitRef}
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          style={{
            pointerEvents: isConnecting ? "none" : "stroke",
            cursor: ctx.editable ? "pointer" : "default",
          }}
          onMouseEnter={onPathMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      )}
      {!hasPopover && ctx.editable && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          style={{
            pointerEvents: isConnecting ? "none" : "stroke",
            cursor: "pointer",
          }}
          onClick={onClick}
        />
      )}
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            ref={labelRef}
            className={`ag-edge-label ag-${kind}${data?.crossDomain ? " ag-cross-domain" : ""}${
              hasPopover ? " has-rationale" : ""
            }${outOfDomain ? " ag-out-of-domain" : ""}${isDimmed ? " is-dimmed" : ""}`}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={onLabelMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
          >
            {kind}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ClaimEdge = memo(ClaimEdgeImpl);
