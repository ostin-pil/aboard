"use client";

import { useState } from "react";

// Icon/label rule: icon-only is permitted ONLY for the universally-understood
// ✕ clear-selection control; every other control is a text label. No SVG
// iconography is introduced anywhere else in this toolbar.

type Props = {
  count: number;
  domains: string[];
  onDelete: () => void;
  onGroupInto: (domain: string) => void;
  onAlignColumn: () => void;
  onDistributeX: () => void;
  onMoveToRow: (row: 1 | 2 | 3) => void;
  onClear: () => void;
};

export function BulkActionsToolbar({
  count,
  domains,
  onDelete,
  onGroupInto,
  onAlignColumn,
  onDistributeX,
  onMoveToRow,
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

      <button
        className="ag-bulk-btn"
        onClick={onAlignColumn}
        title="Snap selected claims to a shared column (left edge of the selection)"
        type="button"
      >
        align column
      </button>
      <button
        className="ag-bulk-btn"
        onClick={onDistributeX}
        disabled={count < 3}
        title="Even horizontal spacing between selected claims (needs 3+)"
        type="button"
      >
        distribute
      </button>

      <span className="ag-bulk-sep" aria-hidden />

      <div className="ag-bulk-cluster" role="group" aria-label="Move to row">
        <button
          className="ag-bulk-btn"
          onClick={() => onMoveToRow(1)}
          title="Move selected claims into the symptom row"
          type="button"
        >
          → symptom
        </button>
        <button
          className="ag-bulk-btn"
          onClick={() => onMoveToRow(2)}
          title="Move selected claims into the mechanism row"
          type="button"
        >
          → mechanism
        </button>
        <button
          className="ag-bulk-btn"
          onClick={() => onMoveToRow(3)}
          title="Move selected claims into the leverage row"
          type="button"
        >
          → leverage
        </button>
      </div>

      <span className="ag-bulk-sep" aria-hidden />

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
