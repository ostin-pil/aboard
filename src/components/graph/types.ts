import type { Node, Edge } from "@xyflow/react";

type ClaimNodeData = {
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

// When a domain group collapses, a boundary edge (one endpoint inside the
// group) is re-pointed to the collapsed pill so it stays visible. The
// original child endpoint + handle is stashed here so expand can restore
// it. Source and target are stashed independently (an edge can cross two
// collapsed groups). Absent on edges that have never been re-pointed.
type CollapsedEndpoint = { node: string; handle: string | null };
export type CollapsedRemap = {
  source?: CollapsedEndpoint;
  target?: CollapsedEndpoint;
};

type ClaimEdgeData = {
  kind: EngineEdge["kind"];
  rationale: string;
  sources: EngineEdgeSource[];
  crossDomain: boolean;
  outOfDomain: boolean;
  collapsedRemap?: CollapsedRemap;
  // Both absent for a sandbox-authored edge, and that absence is the signal
  // the exporter reads: an edge with no `canonicalId` is one it must mint an
  // id for. See EngineEdge in src/types/global.d.ts.
  canonicalId?: EngineEdge["canonicalId"];
  strength?: EngineEdge["strength"];
  [key: string]: unknown;
};

export type ClaimNode = Node<ClaimNodeData, "claim">;
export type ClaimEdge = Edge<ClaimEdgeData, "claim">;

// The real claim endpoints of an edge, seeing through any collapse
// re-pointing. Use this for export/serialization so a collapsed group's
// pill id never leaks into JSON-LD or the PR pack.
export function canonicalEndpoints(e: ClaimEdge): { source: string; target: string } {
  const remap = e.data?.collapsedRemap;
  return {
    source: remap?.source?.node ?? e.source,
    target: remap?.target?.node ?? e.target,
  };
}

type DomainGroupData = {
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
