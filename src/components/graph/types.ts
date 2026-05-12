import type { Node, Edge } from "@xyflow/react";

export type ClaimNodeData = {
  kind: EngineNode["kind"];
  title: string;
  body: string;
  meta: string;
  conf: number;
  author: string;
  filed: string;
  row: 1 | 2 | 3;
  col: number;
  dossier: boolean;
  forecast: number;
  domain: string | undefined;
  outOfDomain: boolean;
  [key: string]: unknown;
};

export type ClaimEdgeData = {
  kind: EngineEdge["kind"];
  rationale: string;
  sources: EngineEdgeSource[];
  crossDomain: boolean;
  outOfDomain: boolean;
  [key: string]: unknown;
};

export type ClaimNode = Node<ClaimNodeData, "claim">;
export type ClaimEdge = Edge<ClaimEdgeData, "claim">;
