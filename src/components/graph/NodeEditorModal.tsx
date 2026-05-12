"use client";

import { useState } from "react";
import type { ClaimNode } from "./types";

type Props = {
  node: ClaimNode | null;
  onSave: (draft: ClaimNode) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  newId: (kind: EngineNode["kind"]) => string;
  existingRowsCount: (row: 1 | 2 | 3) => number;
  defaultPosition: { x: number; y: number };
};

const ROW_BY_KIND: Record<EngineNode["kind"], 1 | 2 | 3> = {
  symptom: 1,
  mechanism: 2,
  leverage: 3,
};

export function NodeEditorModal({
  node,
  onSave,
  onDelete,
  onClose,
  newId,
  existingRowsCount,
  defaultPosition,
}: Props) {
  const isNew = !node;
  const [kind, setKind] = useState<EngineNode["kind"]>(node?.data.kind ?? "mechanism");
  const [title, setTitle] = useState(node?.data.title ?? "");
  const [meta, setMeta] = useState(node?.data.meta ?? "");
  const [body, setBody] = useState(node?.data.body ?? "");
  const [conf, setConf] = useState(node?.data.conf ?? 0.5);

  function onBack(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function save() {
    const row = ROW_BY_KIND[kind];
    const filed = new Date().toISOString().slice(0, 10);
    if (isNew) {
      const id = newId(kind);
      const col = existingRowsCount(row);
      const draft: ClaimNode = {
        id,
        type: "claim",
        position: defaultPosition,
        data: {
          kind,
          title: title.trim() || "untitled claim",
          meta: meta.trim(),
          body: body.trim(),
          conf,
          author: "agent:reader/v0",
          filed,
          row,
          col,
          dossier: false,
          forecast: 0,
          domain: undefined,
          outOfDomain: false,
        },
      };
      onSave(draft);
    } else {
      const draft: ClaimNode = {
        ...node!,
        data: {
          ...node!.data,
          kind,
          title: title.trim() || "untitled claim",
          meta: meta.trim(),
          body: body.trim(),
          conf,
          author: "agent:reader/v0",
          filed,
          row,
        },
      };
      onSave(draft);
    }
  }

  return (
    <div className="ag-modal-back" onClick={onBack}>
      <div className="ag-modal" role="dialog">
        <div className="ag-modal-head">
          <div className="ag-modal-eyebrow">
            {isNew ? "new claim" : "edit · " + node!.id}
          </div>
          <div className="ag-modal-sub">
            authored by <code>agent:reader/v0</code> · unsigned
          </div>
        </div>
        <div className="ag-modal-body">
          <label className="ag-field">
            <span>kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as EngineNode["kind"])}>
              <option value="symptom">symptom</option>
              <option value="mechanism">mechanism</option>
              <option value="leverage">leverage</option>
            </select>
          </label>
          <label className="ag-field">
            <span>title</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="ag-field">
            <span>meta</span>
            <input
              type="text"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder="e.g. evidence · 7 studies"
            />
          </label>
          <label className="ag-field">
            <span>body</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </label>
          <label className="ag-field ag-field-row">
            <span>confidence</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={conf}
              onChange={(e) => setConf(parseFloat(e.target.value) || 0)}
            />
          </label>
        </div>
        <div className="ag-modal-foot">
          {!isNew && (
            <button
              className="btn-mono danger"
              onClick={() => {
                if (!confirm("Delete " + node!.id + " and all its edges?")) return;
                onDelete(node!.id);
              }}
            >
              delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn-mono" onClick={onClose}>
            cancel
          </button>
          <button className="btn-mono primary" onClick={save}>
            {isNew ? "file claim" : "save"}
          </button>
        </div>
      </div>
    </div>
  );
}
