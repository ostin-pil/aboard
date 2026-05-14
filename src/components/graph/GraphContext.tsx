"use client";

import { createContext, useContext } from "react";
import type { ClaimEdge, ClaimNode } from "./types";

export type GraphContextValue = {
  editable: boolean;
  mode: "inline" | "fullbleed";
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  openNodePopover: (n: ClaimNode, anchor: HTMLElement) => void;
  openEdgePopover: (e: ClaimEdge, anchor: HTMLElement | SVGElement, ev?: { clientX: number; clientY: number }) => void;
  scheduleCloseEdgePopover: () => void;
  cancelCloseEdgePopover: () => void;
  openNodeEditor: (n: ClaimNode | null) => void;
  openEdgeEditor: (e: ClaimEdge | { source: string; target: string; kind: EngineEdge["kind"] }) => void;
  isNeighbor: (id: string) => boolean;
  toggleDomainCollapse: (groupId: string) => void;
};

export const GraphContext = createContext<GraphContextValue | null>(null);

export function useGraphContext(): GraphContextValue {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error("useGraphContext: not inside GraphContext.Provider");
  return ctx;
}
