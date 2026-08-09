"use client";

import { useState } from "react";

// One label per canonical kind, so the picker cannot silently offer fewer
// relations than the schema accepts. A new kind in `types.ts` fails the build
// here until it has been described to the human choosing it.
const RELATION_LABEL: Record<EngineEdge["kind"], string> = {
  causes: "causes — directional, evidenced",
  moderates: "moderates — conditions strength",
  reduces: "reduces — leverage edge",
  evidences: "evidences — source supports the target",
};

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
              {Object.entries(RELATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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
