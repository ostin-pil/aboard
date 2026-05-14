import type { ClaimEdge, GraphNode } from "./types";
import { isClaimNode } from "./types";

const STORE_KEY = "aboard.graph.v2";

type PersistedClaim = {
  kind: "claim";
  id: string;
  position: { x: number; y: number };
  parentId?: string;
  data: Extract<GraphNode, { type: "claim" }>["data"];
  hidden?: boolean;
};
type PersistedGroup = {
  kind: "domainGroup";
  id: string;
  position: { x: number; y: number };
  data: Extract<GraphNode, { type: "domainGroup" }>["data"];
  style?: { width?: number | undefined; height?: number | undefined };
};
type Persisted = {
  nodes: (PersistedClaim | PersistedGroup)[];
  edges: { id: string; source: string; target: string; data: ClaimEdge["data"]; hidden?: boolean }[];
};

export function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed?.nodes || !parsed?.edges) return null;
    const first = parsed.nodes[0];
    if (first && (!first.position || !first.data || !first.kind)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersisted(nodes: GraphNode[], edges: ClaimEdge[]) {
  if (typeof window === "undefined") return;
  try {
    const slim: Persisted = {
      nodes: nodes.map((n) => {
        if (isClaimNode(n)) {
          const out: PersistedClaim = {
            kind: "claim",
            id: n.id,
            position: n.position,
            data: n.data,
          };
          if (n.parentId) out.parentId = n.parentId;
          if (n.hidden) out.hidden = true;
          return out;
        }
        const g: PersistedGroup = {
          kind: "domainGroup",
          id: n.id,
          position: n.position,
          data: n.data,
        };
        if (n.style) {
          g.style = {
            width: n.style.width as number | undefined,
            height: n.style.height as number | undefined,
          };
        }
        return g;
      }),
      edges: edges.map((e) => {
        const out: Persisted["edges"][number] = {
          id: e.id,
          source: e.source,
          target: e.target,
          data: e.data!,
        };
        if (e.hidden) out.hidden = true;
        return out;
      }),
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

export function hydrateFromPersisted(p: Persisted): { nodes: GraphNode[]; edges: ClaimEdge[] } {
  const nodes: GraphNode[] = p.nodes.map((n) => {
    if (n.kind === "claim") {
      const node = {
        id: n.id,
        type: "claim" as const,
        position: n.position,
        data: n.data,
        ...(n.parentId
          ? { parentId: n.parentId, extent: "parent" as const }
          : {}),
        ...(n.hidden ? { hidden: true } : {}),
      } as GraphNode;
      return node;
    }
    const g = {
      id: n.id,
      type: "domainGroup" as const,
      position: n.position,
      data: n.data,
      ...(n.style ? { style: n.style } : {}),
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
    } as GraphNode;
    return g;
  });
  const edges: ClaimEdge[] = p.edges.map((e) => ({
    id: e.id,
    type: "claim",
    source: e.source,
    target: e.target,
    data: e.data,
    ...(e.hidden ? { hidden: true } : {}),
  }));
  return { nodes, edges };
}
