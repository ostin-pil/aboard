"use client";

import { useState } from "react";

type Props = {
  count: number;
  domains: string[];
  onDelete: () => void;
  onGroupInto: (domain: string) => void;
  onAlignSameRow: () => void;
  onClear: () => void;
};

export function BulkActionsToolbar({
  count,
  domains,
  onDelete,
  onGroupInto,
  onAlignSameRow,
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
      <span className="ag-bulk-count">{count} selected</span>
      <span className="ag-bulk-sep" aria-hidden />
      <button
        className="ag-bulk-btn"
        onClick={() => setGroupOpen((v) => !v)}
        aria-expanded={groupOpen}
        title="Move selected claims into a domain group"
      >
        group into domain ▾
      </button>
      <button
        className="ag-bulk-btn"
        onClick={onAlignSameRow}
        title="Snap all selected onto the same row as the first one"
      >
        align same row
      </button>
      <button
        className="ag-bulk-btn danger"
        onClick={onDelete}
        title="Delete all selected claims and their edges"
      >
        delete
      </button>
      <span className="ag-bulk-sep" aria-hidden />
      <button
        className="ag-bulk-btn subtle"
        onClick={onClear}
        title="Clear selection"
      >
        ✕
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
