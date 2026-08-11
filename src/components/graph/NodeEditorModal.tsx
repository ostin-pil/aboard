"use client";

import { useId, useState } from "react";
import type { ClaimNode } from "./types";
import { ModalDialog } from "./dialog";

type Props = {
  node: ClaimNode | null;
  onSave: (draft: ClaimNode) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** Domain-aware: the minted id carries the target domain's prefix. */
  newId: (kind: EngineNode["kind"], domain?: string) => string;
  existingRowsCount: (row: 1 | 2 | 3) => number;
  availableDomains: string[];
  defaultDomain?: string;
  /** Read at save time (not render), so the parent never touches layout mid-render. */
  getDefaultPosition: () => { x: number; y: number };
};

const ROW_BY_KIND: Record<EngineNode["kind"], 1 | 2 | 3> = {
  symptom: 1,
  mechanism: 2,
  leverage: 3,
};

// Sentinel select value for "type a new domain".
const NEW_DOMAIN = "__new__";

/**
 * The `min`/`max` attributes on a number input are advisory: the browser marks
 * the field invalid but still reports the typed value, so "5" reached the graph
 * and only failed later, in the loader's `Confidence.min(0).max(1)`, against a
 * file the editor had already written. Clamp at the source.
 */
function clampConfidence(raw: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function NodeEditorModal({
  node,
  onSave,
  onDelete,
  onClose,
  newId,
  existingRowsCount,
  availableDomains,
  defaultDomain,
  getDefaultPosition,
}: Props) {
  const isNew = !node;
  const [kind, setKind] = useState<EngineNode["kind"]>(node?.data.kind ?? "mechanism");
  const [title, setTitle] = useState(node?.data.title ?? "");
  const [meta, setMeta] = useState(node?.data.meta ?? "");
  const [body, setBody] = useState(node?.data.body ?? "");
  const [conf, setConf] = useState(node?.data.conf ?? 0.5);
  // Editing seeds from the claim's domain; a new claim seeds from the
  // editor's active domain (if any). Empty string = no domain.
  const [domainChoice, setDomainChoice] = useState<string>(
    node?.data.domain ?? defaultDomain ?? ""
  );
  const [newDomain, setNewDomain] = useState("");
  const titleId = useId();
  const resolvedDomain = (
    domainChoice === NEW_DOMAIN ? newDomain : domainChoice
  ).trim();

  function save() {
    const row = ROW_BY_KIND[kind];
    const filed = new Date().toISOString().slice(0, 10);
    if (isNew) {
      const id = newId(kind, resolvedDomain || undefined);
      const col = existingRowsCount(row);
      const draft: ClaimNode = {
        id,
        type: "claim",
        position: getDefaultPosition(),
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
          domain: resolvedDomain || undefined,
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
          domain: resolvedDomain || undefined,
        },
      };
      onSave(draft);
    }
  }

  return (
    <ModalDialog
      labelledBy={titleId}
      onClose={onClose}
      backdropClassName="ag-modal-back"
      className="ag-modal"
    >
      <div className="ag-modal-head">
        <div className="ag-modal-eyebrow" id={titleId}>
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
            onChange={(e) => setConf(clampConfidence(e.target.value))}
          />
        </label>
        <label className="ag-field">
          <span>domain</span>
          <select
            value={domainChoice}
            onChange={(e) => setDomainChoice(e.target.value)}
          >
            <option value="">(no domain)</option>
            {availableDomains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value={NEW_DOMAIN}>+ new domain…</option>
          </select>
        </label>
        {domainChoice === NEW_DOMAIN && (
          <label className="ag-field">
            <span>new domain</span>
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="e.g. climate"
              autoFocus
            />
          </label>
        )}
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
    </ModalDialog>
  );
}
