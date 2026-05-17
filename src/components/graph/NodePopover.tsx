"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClaimNode } from "./types";

type Props = {
  node: ClaimNode;
  anchor: HTMLElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
};

export function NodePopover({ node, anchor, containerRef, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = containerRef.current;
    if (!wrap || !ref.current) return;
    const wrapRect = wrap.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const popW = ref.current.offsetWidth || 300;
    const popH = ref.current.offsetHeight || 220;
    let left = r.right - wrapRect.left + 12;
    let top = r.top - wrapRect.top;
    if (left + popW > wrapRect.width - 8) left = r.left - wrapRect.left - popW - 12;
    if (top + popH > wrapRect.height - 8) top = wrapRect.height - popH - 8;
    if (top < 8) top = 8;
    setPos({ left: Math.max(8, left), top });
  }, [anchor, containerRef]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current) return;
      const target = e.target as Node | null;
      if (target && (ref.current.contains(target) || anchor.contains(target))) return;
      onClose();
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [anchor, onClose]);

  const { id, data } = node;

  return (
    <div
      ref={ref}
      className="ag-popover"
      style={{
        position: "absolute",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
        zIndex: 50,
      }}
    >
      <div className="ag-pop-id">
        {id} · {data.kind}
      </div>
      <div className="ag-pop-title">{data.title}</div>
      <div className="ag-pop-body">{data.body}</div>
      <div className="ag-pop-row">
        <span>conf</span>
        <span className="v">{data.conf.toFixed(2)}</span>
      </div>
      <div className="ag-pop-row">
        <span>filed by</span>
        <span className="v">{data.author || "—"}</span>
      </div>
      <div className="ag-pop-row">
        <span>last_filed</span>
        <span className="v">{data.filed || "—"}</span>
      </div>
      {data.dossier && (
        <div className="ag-pop-row">
          <span>dossier</span>
          <span className="v">
            <Link href={`/dossiers/${id}`}>open →</Link>
          </span>
        </div>
      )}
      <div className="ag-pop-cta-row">
        {data.author === "agent:reader/v0" ? (
          <span className="ag-pop-sandbox-note">
            sandbox claim — not filed. Export PR pack from the toolbar to publish.
          </span>
        ) : (
          <Link className="ag-pop-cta" href={`/claims/${id}`}>
            open detail <span className="arrow">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
