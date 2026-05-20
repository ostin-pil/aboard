import type {
  ClaimEdge,
  ClaimNode,
  DomainGroupNode,
  GraphNode,
} from "./types";
import { isClaimNode, isGroupNode } from "./types";

export type LayoutMode = "inline" | "fullbleed";

export const LAYOUT = {
  inline: {
    nodeW: 188,
    rowGap: 132,
    colGap: 22,
    rowY: { 1: 60, 2: 192, 3: 324 } as Record<1 | 2 | 3, number>,
    padX: 16,
    padY: 0,
    groupGapX: 0,
    groupHeaderH: 0,
  },
  fullbleed: {
    nodeW: 240,
    rowGap: 210,
    colGap: 36,
    rowY: { 1: 56, 2: 266, 3: 476 } as Record<1 | 2 | 3, number>,
    padX: 60,
    padY: 50,
    groupGapX: 80,
    groupHeaderH: 32,
  },
} as const;

const COLLAPSED_GROUP_W = 220;
const COLLAPSED_GROUP_H = 56;

export function engineToRF(
  data: EngineGraphData,
  mode: LayoutMode
): { nodes: GraphNode[]; edges: ClaimEdge[] } {
  const layout = LAYOUT[mode];

  // Group claims by domain (single bucket for inline mode).
  const claimsByDomain = new Map<string, EngineNode[]>();
  for (const n of data.nodes) {
    const dom = n.domain ?? "_uncategorized";
    if (!claimsByDomain.has(dom)) claimsByDomain.set(dom, []);
    claimsByDomain.get(dom)!.push(n);
  }
  const domainList = Array.from(claimsByDomain.keys()).sort();
  const useGroups = mode === "fullbleed";

  const nodes: GraphNode[] = [];
  let cursorX = 0;

  for (const domain of domainList) {
    const claims = claimsByDomain.get(domain)!;
    const byRow: Record<1 | 2 | 3, EngineNode[]> = { 1: [], 2: [], 3: [] };
    for (const n of claims) {
      if (n.row >= 1 && n.row <= 3) byRow[n.row as 1 | 2 | 3].push(n);
    }
    for (const r of [1, 2, 3] as const) {
      byRow[r].sort((a, b) => a.col - b.col);
    }

    const maxRowCount = Math.max(byRow[1].length, byRow[2].length, byRow[3].length, 1);
    const groupInnerW = layout.padX * 2 + maxRowCount * layout.nodeW + (maxRowCount - 1) * layout.colGap;
    const groupInnerH = layout.padY * 2 + layout.rowY[3] + 96;
    const groupId = `__domain_${domain}`;

    if (useGroups) {
      const group: DomainGroupNode = {
        id: groupId,
        type: "domainGroup",
        position: { x: cursorX, y: 0 },
        data: { domain, claimCount: claims.length, collapsed: false },
        style: {
          width: groupInnerW,
          height: groupInnerH + layout.groupHeaderH,
        },
        // Header is the drag handle (the chevron button inside it has
        // `nodrag nopan` so it stays clickable). Children move with the
        // group via React Flow's parent semantics.
        draggable: true,
        selectable: false,
        focusable: false,
      };
      nodes.push(group);
    }

    for (const row of [1, 2, 3] as const) {
      byRow[row].forEach((n, i) => {
        const childX = layout.padX + i * (layout.nodeW + layout.colGap);
        const childY = layout.padY + layout.groupHeaderH + layout.rowY[row];
        const node: ClaimNode = {
          id: n.id,
          type: "claim",
          position: useGroups
            ? { x: childX, y: childY }
            : { x: cursorX + childX, y: childY },
          data: {
            kind: n.kind,
            title: n.title,
            body: n.body ?? "",
            meta: n.meta ?? "",
            conf: n.conf ?? 0,
            author: n.author ?? "",
            filed: n.filed ?? "",
            row: row,
            col: i,
            dossier: !!n.dossier,
            forecast: n.forecast ?? 0,
            domain: n.domain,
            outOfDomain: false,
          },
          ...(useGroups
            ? { parentId: groupId, extent: "parent" as const }
            : {}),
        };
        nodes.push(node);
      });
    }

    cursorX += (useGroups ? groupInnerW : groupInnerW) + layout.groupGapX;
  }

  const edges: ClaimEdge[] = data.edges.map((e, i) => ({
    id: `${e.from}->${e.to}#${e.kind}#${i}`,
    type: "claim",
    source: e.from,
    target: e.to,
    data: {
      kind: e.kind,
      rationale: e.rationale ?? "",
      sources: e.sources ?? [],
      crossDomain: !!e.crossDomain,
      outOfDomain: false,
    },
  }));

  return { nodes, edges };
}

export function rfToEngine(
  nodes: GraphNode[],
  edges: ClaimEdge[],
  domains: string[] | undefined,
  domain: string | undefined
): EngineGraphData {
  const claimNodes = nodes.filter(isClaimNode);
  const engineNodes: EngineNode[] = claimNodes.map((n) => {
    const out: EngineNode = {
      id: n.id,
      kind: n.data.kind,
      title: n.data.title,
      row: n.data.row,
      col: n.data.col,
    };
    if (n.data.body) out.body = n.data.body;
    if (n.data.meta) out.meta = n.data.meta;
    if (n.data.conf) out.conf = n.data.conf;
    if (n.data.author) out.author = n.data.author;
    if (n.data.filed) out.filed = n.data.filed;
    if (n.data.dossier) out.dossier = true;
    if (n.data.forecast) out.forecast = n.data.forecast;
    if (n.data.domain) out.domain = n.data.domain;
    return out;
  });
  const engineEdges: EngineEdge[] = edges.map((e) => {
    const out: EngineEdge = {
      from: e.source,
      to: e.target,
      kind: e.data?.kind ?? "causes",
    };
    if (e.data?.rationale) out.rationale = e.data.rationale;
    if (e.data?.sources && e.data.sources.length > 0) out.sources = e.data.sources;
    if (e.data?.crossDomain) out.crossDomain = true;
    return out;
  });
  return { domain, domains, nodes: engineNodes, edges: engineEdges };
}

export { COLLAPSED_GROUP_W, COLLAPSED_GROUP_H };

/**
 * Resize each domainGroup node so it tightly contains its child claims.
 * No-op for collapsed groups (their pill size is fixed).
 */
export function recomputeGroupBounds(
  nodes: GraphNode[],
  mode: LayoutMode = "fullbleed"
): GraphNode[] {
  const layout = LAYOUT[mode];
  const byParent = new Map<string, ClaimNode[]>();
  for (const n of nodes) {
    if (isClaimNode(n) && n.parentId) {
      const arr = byParent.get(n.parentId) ?? [];
      arr.push(n);
      byParent.set(n.parentId, arr);
    }
  }
  return nodes.map((n) => {
    if (!isGroupNode(n)) return n;
    if (n.data.collapsed) return n;
    const children = byParent.get(n.id) ?? [];
    const childCount = children.length;
    if (childCount === 0) return n;
    const maxX = Math.max(
      ...children.map((c) => c.position.x + layout.nodeW)
    );
    const maxY = Math.max(...children.map((c) => c.position.y)) + 96;
    const width = Math.max(maxX + layout.padX, layout.nodeW + layout.padX * 2);
    const height = Math.max(
      maxY + layout.padY,
      layout.rowY[3] + layout.groupHeaderH + 96
    );
    return {
      ...n,
      data: { ...n.data, claimCount: childCount },
      style: { ...n.style, width, height },
    };
  });
}
