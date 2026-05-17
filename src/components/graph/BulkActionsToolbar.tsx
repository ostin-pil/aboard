"use client";

import { useState } from "react";
import type { HAlign } from "./align";

type Props = {
  count: number;
  domains: string[];
  onDelete: () => void;
  onGroupInto: (domain: string) => void;
  onAlignX: (op: HAlign) => void;
  onDistributeX: () => void;
  onAlignToRow: () => void;
  onClear: () => void;
};

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="ag-bulk-icon"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      type="button"
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

export function BulkActionsToolbar({
  count,
  domains,
  onDelete,
  onGroupInto,
  onAlignX,
  onDistributeX,
  onAlignToRow,
  onClear,
}: Props) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  const commitGroup = (domain: string) => {
    const d = domain.trim();
    if (!d) return;
    onGroupInto(d);
    setGroupOpen(false);
    setNewDomain("");
  };

  return (
    <div className="ag-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
      <span className="ag-bulk-count">{count}</span>

      <span className="ag-bulk-sep" aria-hidden />

      <div className="ag-bulk-cluster" role="group" aria-label="Align horizontal">
        <IconBtn label="Align left" onClick={() => onAlignX("left")}>
          <path d="M4 3v18M8 7h10v3H8zM8 14h6v3H8z" fill="currentColor" />
        </IconBtn>
        <IconBtn label="Align horizontal centers" onClick={() => onAlignX("hcenter")}>
          <path d="M12 3v18M7 7h10v3H7zM9 14h6v3H9z" fill="currentColor" />
        </IconBtn>
        <IconBtn label="Align right" onClick={() => onAlignX("right")}>
          <path d="M20 3v18M6 7h10v3H6zM10 14h6v3h-6z" fill="currentColor" />
        </IconBtn>
        <IconBtn
          label="Distribute horizontally (3+)"
          onClick={onDistributeX}
          disabled={count < 3}
        >
          <path
            d="M4 3v18M20 3v18M10.5 7h3v10h-3z"
            fill="currentColor"
          />
        </IconBtn>
      </div>

      <span className="ag-bulk-sep" aria-hidden />

      <button
        className="ag-bulk-btn"
        onClick={onAlignToRow}
        title="Snap selected onto the row of the first selected claim"
        type="button"
      >
        align row
      </button>
      <button
        className="ag-bulk-btn"
        onClick={() => setGroupOpen((v) => !v)}
        aria-expanded={groupOpen}
        title="Move selected claims into a domain group"
        type="button"
      >
        group ▾
      </button>

      <span className="ag-bulk-sep" aria-hidden />

      <button
        className="ag-bulk-btn danger"
        onClick={onDelete}
        title="Delete all selected claims and their edges"
        type="button"
      >
        delete
      </button>
      <button
        className="ag-bulk-icon subtle"
        onClick={onClear}
        title="Clear selection"
        aria-label="Clear selection"
        type="button"
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>

      {groupOpen && (
        <div className="ag-bulk-pop" role="dialog" aria-label="Pick domain">
          {domains.length > 0 && (
            <div className="ag-bulk-pop-list">
              {domains.map((d) => (
                <button
                  key={d}
                  className="ag-bulk-pop-row"
                  onClick={() => commitGroup(d)}
                  type="button"
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          <form
            className="ag-bulk-pop-new"
            onSubmit={(e) => {
              e.preventDefault();
              commitGroup(newDomain);
            }}
          >
            <input
              type="text"
              placeholder="new domain…"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              autoFocus
            />
            <button type="submit" className="ag-bulk-btn primary">
              add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
