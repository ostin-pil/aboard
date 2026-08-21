"use client";

import { createContext, useContext } from "react";
import type { ClaimEdge } from "./types";

export type GraphContextValue = {
  editable: boolean;
  mode: "inline" | "fullbleed";
  // Read by the node and edge components to dim themselves. Setting it is not
  // exposed: the neighbourhood highlight follows hover and focus, both of which
  // arrive at React Flow's wrapper rather than at anything a component renders,
  // so the canvas owns both halves. Same story for the detail popover, which is
  // why there is no opener here either.
  focusId: string | null;
  openEdgePopover: (e: ClaimEdge, anchor: HTMLElement | SVGElement, ev?: { clientX: number; clientY: number }) => void;
  scheduleCloseEdgePopover: () => void;
  cancelCloseEdgePopover: () => void;
  openNodeEditor: (id: string | null) => void;
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
