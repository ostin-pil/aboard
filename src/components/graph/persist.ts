import type { ClaimEdge, GraphNode } from "./types";
import { isClaimNode, isGroupNode, orderParentsFirst } from "./types";

// A transient overlay handle ("full-target") only exists during a
// connection drag; an edge persisted against it dangles forever and
// React Flow logs error #008. Drop any full-* handle on load.
const cleanHandle = (h?: string) =>
  h && !h.startsWith("full-") ? h : undefined;

const STORE_KEY = "aboard.graph.v3";
const LEGACY_STORE_KEYS = ["aboard.graph.v2"];

// Collapsed domain-group ids live under a SEPARATE key so they survive a
// graph `reset` (which clears STORE_KEY only). Value: JSON string[] of group
// node ids. Stale ids (groups absent after a rebuild) are ignored on apply.
const COLLAPSED_KEY = "aboard.graph.collapsedGroups.v1";

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
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    data: ClaimEdge["data"];
    hidden?: boolean;
  }[];
};

export function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    for (const k of LEGACY_STORE_KEYS) {
      try { window.localStorage.removeItem(k); } catch { /* non-fatal */ }
    }
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
      nodes: orderParentsFirst(nodes).map((n) => {
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
        if (e.sourceHandle) out.sourceHandle = e.sourceHandle;
        if (e.targetHandle) out.targetHandle = e.targetHandle;
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
    // Intentionally does NOT remove COLLAPSED_KEY — collapsed-group state is
    // meant to survive `reset`.
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // non-fatal
  }
}

export function loadCollapsedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function saveCollapsedIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids));
  } catch {
    // non-fatal
  }
}

/**
 * Pure: apply collapsed state for a set of group ids onto fresh nodes/edges.
 * Mirrors the three effects of toggleDomainCollapse exactly (group flag +
 * collapsed dims; child claims hidden; edges touching those children hidden)
 * so the reset path and the toggle path can never desync. Group ids not
 * present in `nodes` are silently ignored (stale after a rebuild).
 */
export function applyCollapsedState(
  nodes: GraphNode[],
  edges: ClaimEdge[],
  collapsedIds: Iterable<string>,
  collapsedDims: { w: number; h: number }
): { nodes: GraphNode[]; edges: ClaimEdge[] } {
  const wanted = new Set(collapsedIds);
  if (wanted.size === 0) return { nodes, edges };

  const present = new Set<string>();
  for (const n of nodes) {
    if (isGroupNode(n) && wanted.has(n.id)) present.add(n.id);
  }
  if (present.size === 0) return { nodes, edges };

  const hiddenChildIds = new Set<string>();
  for (const n of nodes) {
    if (isClaimNode(n) && n.parentId && present.has(n.parentId)) {
      hiddenChildIds.add(n.id);
    }
  }

  const nextNodes = nodes.map((n) => {
    if (isGroupNode(n) && present.has(n.id)) {
      return {
        ...n,
        data: { ...n.data, collapsed: true },
        style: {
          ...n.style,
          width: collapsedDims.w,
          height: collapsedDims.h,
        },
      } as GraphNode;
    }
    if (hiddenChildIds.has(n.id)) {
      return { ...n, hidden: true } as GraphNode;
    }
    return n;
  });

  const nextEdges = edges.map((e) =>
    hiddenChildIds.has(e.source) || hiddenChildIds.has(e.target)
      ? { ...e, hidden: true }
      : e
  );

  return { nodes: nextNodes, edges: nextEdges };
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
    } as GraphNode;
    return g;
  });
  const edges: ClaimEdge[] = p.edges.map((e) => {
    const sh = cleanHandle(e.sourceHandle);
    const th = cleanHandle(e.targetHandle);
    return {
      id: e.id,
      type: "claim",
      source: e.source,
      target: e.target,
      ...(sh ? { sourceHandle: sh } : {}),
      ...(th ? { targetHandle: th } : {}),
      data: e.data,
      ...(e.hidden ? { hidden: true } : {}),
    };
  });
  return { nodes: orderParentsFirst(nodes), edges };
}
