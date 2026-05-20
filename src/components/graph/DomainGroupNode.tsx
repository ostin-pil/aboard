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
      {/* Header is a plain div so it acts as a drag handle for the group;
          only the chevron button is `nodrag nopan` and clickable. */}
      <div className="ag-domain-group-header">
        <button
          type="button"
          className="ag-domain-group-toggle nodrag nopan"
          title={collapsed ? "Expand group" : "Collapse group"}
          aria-label={collapsed ? "Expand group" : "Collapse group"}
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation();
            ctx.toggleDomainCollapse(id);
          }}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="ag-domain-group-label">{data.domain}</span>
        <span className="ag-domain-group-count">{data.claimCount}</span>
      </div>
    </div>
  );
}

export const DomainGroupNode = memo(DomainGroupNodeImpl);
