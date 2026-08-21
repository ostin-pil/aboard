import type {
  ClaimEdge,
  ClaimNode,
  CollapsedRemap,
  DomainGroupNode,
  GraphNode,
} from "./types";
import { canonicalEndpoints, isClaimNode, isGroupNode } from "./types";

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
      // Left undefined rather than defaulted: undefined is what tells the
      // exporter this edge needs an id minted, so a default here would make
      // every sandbox edge claim an identity it does not have.
      ...(e.canonicalId !== undefined ? { canonicalId: e.canonicalId } : {}),
      ...(e.strength !== undefined ? { strength: e.strength } : {}),
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
    // Use canonical endpoints so a collapsed group's pill id (set when a
    // boundary edge is re-pointed) never leaks into the exported model.
    const { source, target } = canonicalEndpoints(e);
    const out: EngineEdge = {
      from: source,
      to: target,
      kind: e.data?.kind ?? "causes",
    };
    if (e.data?.rationale) out.rationale = e.data.rationale;
    if (e.data?.sources && e.data.sources.length > 0) out.sources = e.data.sources;
    if (e.data?.crossDomain) out.crossDomain = true;
    if (e.data?.canonicalId !== undefined) out.canonicalId = e.data.canonicalId;
    if (e.data?.strength !== undefined) out.strength = e.data.strength;
    return out;
  });
  return { domain, domains, nodes: engineNodes, edges: engineEdges };
}

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

/**
 * Expanding a collapsed domain group, as two pure transforms over the node and
 * edge lists.
 *
 * Extracted because there are two ways into a collapsed group and they used to
 * disagree. The chevron ran this logic; filing a claim into the group from the
 * node editor ran none of it, so the claim landed visible and detached below
 * the 220x56 pill with its edges drawn to siblings that were hidden. One
 * transform, both callers.
 *
 * `childIds` is the group's claims *before* the caller's own change, which is
 * what the edge remap has to be keyed on: a claim being filed in has no
 * stashed endpoint to restore.
 */
export function expandGroupNodes(
  nodes: GraphNode[],
  groupId: string,
  childIds: Set<string>,
  mode: LayoutMode
): GraphNode[] {
  const mapped = nodes.map((n): GraphNode => {
    if (n.id === groupId && isGroupNode(n)) {
      return {
        ...n,
        data: { ...n.data, collapsed: false },
        // Clearing the pill's width/height is what lets recomputeGroupBounds
        // size the group from its now-visible children. Left set, React Flow
        // keeps the cached 220x56 box and crushes the children into a corner.
        style: { ...n.style, width: undefined, height: undefined },
      };
    }
    if (childIds.has(n.id)) return { ...n, hidden: false };
    return n;
  });
  return recomputeGroupBounds(mapped, mode);
}

/**
 * The edge half: un-hide the group's internal edges and restore any boundary
 * edge that was re-pointed at the collapsed pill. An edge crossing two
 * collapsed groups keeps the other group's remap until that group expands too.
 */
export function expandGroupEdges(
  edges: ClaimEdge[],
  childIds: Set<string>
): ClaimEdge[] {
  return edges.map((e) => {
    // Internal edges (both literal ends are children) were only hidden, never
    // re-pointed, so they just come back.
    if (childIds.has(e.source) && childIds.has(e.target)) {
      return { ...e, hidden: false };
    }
    const remap = e.data?.collapsedRemap;
    const restoreSource = !!remap?.source && childIds.has(remap.source.node);
    const restoreTarget = !!remap?.target && childIds.has(remap.target.node);
    if (!restoreSource && !restoreTarget) return e;
    const next: ClaimEdge = { ...e };
    const newRemap: CollapsedRemap = { ...remap };
    if (restoreSource) {
      next.source = remap!.source!.node;
      next.sourceHandle = remap!.source!.handle ?? undefined;
      delete newRemap.source;
    }
    if (restoreTarget) {
      next.target = remap!.target!.node;
      next.targetHandle = remap!.target!.handle ?? undefined;
      delete newRemap.target;
    }
    const data = { ...e.data! };
    if (newRemap.source || newRemap.target) data.collapsedRemap = newRemap;
    else delete data.collapsedRemap;
    next.data = data;
    return next;
  });
}

/**
 * Collapsing a domain group, the inverse of the pair above. Lives here for the
 * same reason the expand half does: this is where the collapse geometry is, and
 * a transform the component keeps to itself is a transform no test can reach.
 *
 * The group takes the fixed pill size rather than being re-measured, which is
 * why `recomputeGroupBounds` skips collapsed groups instead of this calling it.
 */
export function collapseGroupNodes(
  nodes: GraphNode[],
  groupId: string,
  childIds: Set<string>
): GraphNode[] {
  return nodes.map((n): GraphNode => {
    if (n.id === groupId && isGroupNode(n)) {
      return {
        ...n,
        data: { ...n.data, collapsed: true },
        style: {
          ...n.style,
          width: COLLAPSED_GROUP_W,
          height: COLLAPSED_GROUP_H,
        },
      };
    }
    if (childIds.has(n.id)) return { ...n, hidden: true };
    return n;
  });
}

/**
 * The edge half. An edge with both ends inside the group is hidden: it would
 * be drawn entirely inside the pill. An edge with exactly one end inside is
 * re-pointed at the pill so the connection stays visible, and its real
 * endpoint is stashed in `collapsedRemap` for `expandGroupEdges` to restore.
 * Source and target are stashed independently, so an edge crossing two
 * collapsed groups carries a remap for each.
 */
export function collapseGroupEdges(
  edges: ClaimEdge[],
  groupId: string,
  childIds: Set<string>
): ClaimEdge[] {
  return edges.map((e) => {
    const sourceInside = childIds.has(e.source);
    const targetInside = childIds.has(e.target);
    if (sourceInside && targetInside) return { ...e, hidden: true };
    if (!sourceInside && !targetInside) return e;

    const remap: CollapsedRemap = { ...(e.data?.collapsedRemap ?? {}) };
    if (sourceInside) {
      remap.source = { node: e.source, handle: e.sourceHandle ?? null };
    }
    if (targetInside) {
      remap.target = { node: e.target, handle: e.targetHandle ?? null };
    }
    return {
      ...e,
      hidden: false,
      ...(sourceInside ? { source: groupId, sourceHandle: null } : {}),
      ...(targetInside ? { target: groupId, targetHandle: null } : {}),
      data: { ...e.data!, collapsedRemap: remap },
    };
  });
}

/**
 * Build a fresh domain-group node positioned to the right of the existing
 * groups. Shared by `bulkGroupInto` and create-time domain slotting so a
 * synthesized group matches what `engineToRF` produces — notably
 * `draggable: true` (session 11 made groups draggable from the header).
 */
export function makeDomainGroupNode(
  domainName: string,
  nodes: GraphNode[],
  mode: LayoutMode
): DomainGroupNode {
  const layout = LAYOUT[mode];
  let maxRight = 0;
  for (const n of nodes) {
    if (isGroupNode(n)) {
      const w = (n.style?.width as number | undefined) ?? 600;
      maxRight = Math.max(maxRight, n.position.x + w);
    }
  }
  return {
    id: `__domain_${domainName}`,
    type: "domainGroup",
    position: { x: maxRight === 0 ? 0 : maxRight + layout.groupGapX, y: 0 },
    data: { domain: domainName, claimCount: 0, collapsed: false },
    style: {
      width: layout.padX * 2 + layout.nodeW + 200,
      height: layout.rowY[3] + layout.groupHeaderH + 96,
    },
    draggable: true,
    selectable: false,
    focusable: false,
  };
}
