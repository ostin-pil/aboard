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
        // Chevron + explicit verb make the disclosure role obvious; the
        // title/aria-label flip with state so it reads as a control, not a
        // decoration. (Text glyphs only — no SVG; the bulk-toolbar
        // icon-ban is scoped to that toolbar, not this disclosure widget.)
        title={collapsed ? "Expand group" : "Collapse group"}
        aria-label={collapsed ? "Expand group" : "Collapse group"}
        aria-expanded={!collapsed}
        onClick={(e) => {
          e.stopPropagation();
          ctx.toggleDomainCollapse(id);
        }}
      >
        <span className="ag-domain-group-toggle" aria-hidden>
          {collapsed ? "▸" : "▾"}
        </span>
        <span className="ag-domain-group-label">{data.domain}</span>
        <span className="ag-domain-group-count">{data.claimCount}</span>
        <span className="ag-domain-group-action" aria-hidden>
          {collapsed ? "expand" : "collapse"}
        </span>
      </button>
    </div>
  );
}

export const DomainGroupNode = memo(DomainGroupNodeImpl);
