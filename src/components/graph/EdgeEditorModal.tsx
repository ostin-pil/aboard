"use client";

import { useState } from "react";

type Draft = {
  id?: string;
  source: string;
  target: string;
  kind: EngineEdge["kind"];
  isNew: boolean;
};

type Props = {
  draft: Draft;
  onSave: (kind: EngineEdge["kind"]) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function EdgeEditorModal({ draft, onSave, onDelete, onClose }: Props) {
  const [kind, setKind] = useState<EngineEdge["kind"]>(draft.kind);

  function onBack(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="ag-modal-back" onClick={onBack}>
      <div className="ag-modal" role="dialog">
        <div className="ag-modal-head">
          <div className="ag-modal-eyebrow">{draft.isNew ? "new edge" : "edit edge"}</div>
          <div className="ag-modal-sub">
            <code>{draft.source}</code> → <code>{draft.target}</code>
          </div>
        </div>
        <div className="ag-modal-body">
          <label className="ag-field">
            <span>relation</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as EngineEdge["kind"])}
            >
              <option value="causes">causes — directional, evidenced</option>
              <option value="moderates">moderates — conditions strength</option>
              <option value="reduces">reduces — leverage edge</option>
            </select>
          </label>
        </div>
        <div className="ag-modal-foot">
          {!draft.isNew && (
            <button className="btn-mono danger" onClick={onDelete}>
              delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn-mono" onClick={onClose}>
            cancel
          </button>
          <button className="btn-mono primary" onClick={() => onSave(kind)}>
            {draft.isNew ? "add edge" : "save"}
          </button>
        </div>
      </div>
    </div>
  );
}
