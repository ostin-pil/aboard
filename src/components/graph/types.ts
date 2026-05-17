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

export type DomainGroupData = {
  domain: string;
  claimCount: number;
  collapsed: boolean;
  [key: string]: unknown;
};
export type DomainGroupNode = Node<DomainGroupData, "domainGroup">;

export type GraphNode = ClaimNode | DomainGroupNode;

export function isClaimNode(n: GraphNode): n is ClaimNode {
  return n.type === "claim";
}
export function isGroupNode(n: GraphNode): n is DomainGroupNode {
  return n.type === "domainGroup";
}

// React Flow requires a parent node to appear before its children in the
// nodes array, or it logs "Parent node ... not found" and the child's
// extent:'parent' can't resolve (pins the node). Claims' only parents are
// domain groups, so groups-then-claims (stable) satisfies the invariant.
export function orderParentsFirst(nodes: GraphNode[]): GraphNode[] {
  return [...nodes.filter(isGroupNode), ...nodes.filter(isClaimNode)];
}
