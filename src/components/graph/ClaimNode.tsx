"use client";

import { memo, useRef } from "react";
import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";
import { useGraphContext } from "./GraphContext";
import type { ClaimNode as ClaimNodeT } from "./types";

const LOD_THRESHOLD = 0.6;
const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

function ClaimNodeImpl({ id, data, selected }: NodeProps<ClaimNodeT>) {
  const ctx = useGraphContext();
  const ref = useRef<HTMLDivElement>(null);
  const zoom = useStore(zoomSelector);
  const lod = zoom < LOD_THRESHOLD;
  const isFocused = ctx.focusId !== null && ctx.isNeighbor(id);
  const isDimmed = ctx.focusId !== null && !ctx.isNeighbor(id);

  const classes = [
    "ag-node",
    "ag-node-rf",
    lod ? "ag-node-lod" : "",
    isFocused ? "is-active" : "",
    isDimmed ? "is-dimmed" : "",
    selected ? "is-selected" : "",
    data.outOfDomain ? "ag-out-of-domain" : "",
    data.author === "agent:reader/v0" ? "ag-unsigned" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Click without modifier: open detail popover. With modifier (Cmd/Ctrl/Shift):
  // let React Flow handle selection — don't preventDefault or stopPropagation,
  // those swallow the event before selection runs.
  const onClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (ref.current) ctx.openNodePopover({ id, data, position: { x: 0, y: 0 }, type: "claim" } as ClaimNodeT, ref.current);
  };

  const onMouseEnter = () => ctx.setFocusId(id);
  const onMouseLeave = () => ctx.setFocusId(null);

  return (
    <div
      ref={ref}
      className={classes}
      data-kind={data.kind}
      data-id={id}
      data-domain={data.domain}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Handle type="target" position={Position.Top} className="ag-rf-handle" isConnectable={ctx.editable} />
      <Handle type="target" position={Position.Left} className="ag-rf-handle" isConnectable={ctx.editable} id="left-target" />
      <Handle type="target" position={Position.Right} className="ag-rf-handle" isConnectable={ctx.editable} id="right-target" />

      <div className="ag-node-meta">
        <span className="kind">{data.kind.toUpperCase()}</span>
        <span className="id-part"> · {id}</span>
        {!lod && <span className="conf">c={data.conf.toFixed(2)}</span>}
      </div>

      {!lod && <div className="ag-node-title">{data.title}</div>}

      {!lod && (data.dossier || data.forecast > 0 || data.author === "agent:reader/v0") && (
        <div className="ag-node-badges">
          {data.forecast > 0 && (
            <span className="ag-badge">
              <span className="b-dot" />
              {data.forecast} forecast
            </span>
          )}
          {data.dossier && (
            <span className="ag-badge dossier">
              <span className="b-dot" />
              dossier
            </span>
          )}
          {data.author === "agent:reader/v0" && (
            <span className="ag-badge unsigned">
              <span className="b-dot" />
              unsigned
            </span>
          )}
        </div>
      )}

      {!lod && ctx.editable && (
        <button
          className="ag-node-edit-btn"
          title="Edit node"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            ctx.openNodeEditor({ id, data, position: { x: 0, y: 0 }, type: "claim" } as ClaimNodeT);
          }}
        >
          ✎
        </button>
      )}

      <Handle type="source" position={Position.Bottom} className="ag-rf-handle" isConnectable={ctx.editable} />
      <Handle type="source" position={Position.Left} className="ag-rf-handle" isConnectable={ctx.editable} id="left-source" />
      <Handle type="source" position={Position.Right} className="ag-rf-handle" isConnectable={ctx.editable} id="right-source" />
    </div>
  );
}

export const ClaimNode = memo(ClaimNodeImpl);
