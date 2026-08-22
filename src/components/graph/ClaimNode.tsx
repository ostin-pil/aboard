"use client";

import { memo } from "react";
import { Handle, Position, useConnection, useStore, type NodeProps } from "@xyflow/react";
import { useGraphContext } from "./GraphContext";
import type { ClaimNode as ClaimNodeT } from "./types";

const LOD_THRESHOLD = 0.6;
const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

function ClaimNodeImpl({ id, data, selected }: NodeProps<ClaimNodeT>) {
  const ctx = useGraphContext();
  const zoom = useStore(zoomSelector);
  const lod = zoom < LOD_THRESHOLD;
  const isFocused = ctx.focusId !== null && ctx.isNeighbor(id);
  const isDimmed = ctx.focusId !== null && !ctx.isNeighbor(id);

  const connection = useConnection();
  const isConnecting = !!connection.inProgress;
  const isSelfConnecting = connection.fromNode?.id === id;
  const showFullDropZone = isConnecting && !isSelfConnecting && ctx.editable;

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

  // Nothing interactive is bound here. Opening the detail popover and the
  // neighbourhood highlight both hang off React Flow's node wrapper instead
  // (`onNodeClick`, `onNodeMouseEnter`, and the canvas's own focus and keydown
  // listeners), because the wrapper is the element that holds the tab stop and
  // a keydown never reaches this div from it. That is what lets pointer and
  // keyboard run the same code path rather than two that drift.
  return (
    <div
      className={classes}
      data-kind={data.kind}
      data-id={id}
      data-domain={data.domain}
    >
      <Handle type="target" position={Position.Top} className="ag-rf-handle" isConnectable={ctx.editable} />
      <Handle type="target" position={Position.Left} className="ag-rf-handle" isConnectable={ctx.editable} id="left-target" />
      <Handle type="target" position={Position.Right} className="ag-rf-handle" isConnectable={ctx.editable} id="right-target" />

      {showFullDropZone && (
        <Handle
          type="target"
          position={Position.Top}
          id="full-target"
          className="ag-rf-full-target"
          isConnectable
        />
      )}

      {lod ? (
        <div className="ag-node-lod-row">
          <span className="ag-node-lod-title" title={data.title}>{data.title}</span>
          <span className="ag-node-lod-id">{id}</span>
        </div>
      ) : (
        <>
          <div className="ag-node-meta">
            <span className="kind">{data.kind.toUpperCase()}</span>
            <span className="id-part"> · {id}</span>
            <span className="conf">c={data.conf.toFixed(2)}</span>
          </div>
          <div className="ag-node-title">{data.title}</div>
        </>
      )}

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
          title="Edit claim"
          aria-label="Edit claim"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            ctx.openNodeEditor(id);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}

      <Handle type="source" position={Position.Bottom} className="ag-rf-handle" isConnectable={ctx.editable} />
      <Handle type="source" position={Position.Left} className="ag-rf-handle" isConnectable={ctx.editable} id="left-source" />
      <Handle type="source" position={Position.Right} className="ag-rf-handle" isConnectable={ctx.editable} id="right-source" />
    </div>
  );
}

export const ClaimNode = memo(ClaimNodeImpl);
