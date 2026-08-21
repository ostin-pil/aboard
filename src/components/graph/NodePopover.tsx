"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClaimNode } from "./types";

type Props = {
  node: ClaimNode;
  anchor: HTMLElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  /**
   * Set when the popover was opened by pressing Enter on the node. The panel
   * then takes focus, because it renders after every node in the DOM: left
   * where it is, its "open detail" link sits thirty tab stops away from the
   * node that opened it. The canvas returns focus to that node on Escape.
   * A pointer-opened popover leaves focus alone. Named `takeFocus` rather than
   * `autoFocus` because it is not the DOM attribute: focus moves when the panel
   * opens on a keypress, never when it opens on arrival.
   */
  takeFocus?: boolean;
};

export function NodePopover({ node, anchor, containerRef, onClose, takeFocus }: Props) {
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
    if (takeFocus) ref.current?.focus();
  }, [takeFocus]);

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
      // A non-modal dialog: it takes focus when opened from the keyboard and
      // Escape closes it, but Tab leaves it rather than being trapped. The
      // name is the claim id, which is what the node announced a moment ago.
      role="dialog"
      aria-label={`${id} details`}
      tabIndex={-1}
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
