"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { useGraphContext } from "./GraphContext";
import type { DomainGroupNode as DomainGroupNodeT } from "./types";

function DomainGroupNodeImpl({ id, data }: NodeProps<DomainGroupNodeT>) {
  const ctx = useGraphContext();
  const collapsed = data.collapsed;

  return (
    <div
      className={`ag-domain-group${collapsed ? " is-collapsed" : ""}`}
      data-domain={data.domain}
    >
      <button
        type="button"
        className="ag-domain-group-header"
        onClick={(e) => {
          e.stopPropagation();
          ctx.toggleDomainCollapse(id);
        }}
      >
        <span className="ag-domain-group-toggle">{collapsed ? "+" : "−"}</span>
        <span className="ag-domain-group-label">{data.domain}</span>
        <span className="ag-domain-group-count">{data.claimCount}</span>
      </button>
    </div>
  );
}

export const DomainGroupNode = memo(DomainGroupNodeImpl);
