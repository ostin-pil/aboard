import type { ClaimEdge, ClaimNode } from "./types";

const STORE_KEY = "aboard.graph.v1";

type Persisted = {
  nodes: { id: string; position: { x: number; y: number }; data: ClaimNode["data"] }[];
  edges: { id: string; source: string; target: string; data: ClaimEdge["data"] }[];
};

export function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed?.nodes || !parsed?.edges) return null;
    const first = parsed.nodes[0];
    if (first && (!first.position || !first.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersisted(nodes: ClaimNode[], edges: ClaimEdge[]) {
  if (typeof window === "undefined") return;
  try {
    const slim: Persisted = {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data! })),
    };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(slim));
  } catch {
    // localStorage may be unavailable; non-fatal
  }
}

export function clearPersisted() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // non-fatal
  }
}

export function hydrateFromPersisted(p: Persisted): { nodes: ClaimNode[]; edges: ClaimEdge[] } {
  const nodes: ClaimNode[] = p.nodes.map((n) => ({
    id: n.id,
    type: "claim",
    position: n.position,
    data: n.data,
  }));
  const edges: ClaimEdge[] = p.edges.map((e) => ({
    id: e.id,
    type: "claim",
    source: e.source,
    target: e.target,
    data: e.data,
  }));
  return { nodes, edges };
}
