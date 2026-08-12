import type { XBox } from "./align";
import {
  LAYOUT,
  expandGroupNodes,
  makeDomainGroupNode,
  recomputeGroupBounds,
  type LayoutMode,
} from "./engine-to-rf";
import {
  isClaimNode,
  isGroupNode,
  orderParentsFirst,
  type ClaimEdge,
  type ClaimNode,
  type GraphNode,
} from "./types";

/**
 * The graph mutations the canvas performs, as pure functions of the node and
 * edge lists.
 *
 * Each of these was the body of a `setNodes`/`setEdges` updater inside
 * `ClaimGraphRF.tsx`, where it was closed over component state and reachable
 * only by rendering the whole canvas. They are the part of the component that
 * can be quietly wrong — slot arithmetic, reparenting, coordinate-space
 * conversion — and nothing else in the file is.
 *
 * A React state updater must stay pure and may be invoked twice, which these
 * now are by construction rather than by discipline.
 */

/**
 * A group that a save is about to file a claim into while it is collapsed.
 * Resolved against the *committed* graph before the updater runs, never inside
 * it: deciding this in the updater would make the updater's result depend on
 * how many times React chose to call it.
 */
export type ExpandTarget = { groupId: string; childIds: Set<string> };

/**
 * Whether saving `draft` files it into a collapsed group, and if so which
 * claims that group held beforehand.
 *
 * Null unless the group exists, is collapsed, and this save is what moves the
 * claim into it. Editing the title of a claim that already sits inside a
 * collapsed group must not pop the group open.
 */
export function resolveExpandTarget(
  nodes: GraphNode[],
  draft: ClaimNode,
  mode: LayoutMode
): ExpandTarget | null {
  if (mode !== "fullbleed" || !draft.data.domain) return null;
  const before = nodes.find((n) => n.id === draft.id);
  const currentDomain = before && isClaimNode(before) ? before.data.domain : undefined;
  if (before && draft.data.domain === currentDomain) return null;
  const groupId = `__domain_${draft.data.domain}`;
  const group = nodes.find((n) => n.id === groupId);
  if (!group || !isGroupNode(group) || !group.data.collapsed) return null;
  return {
    groupId,
    childIds: new Set(
      nodes
        .filter((n): n is ClaimNode => isClaimNode(n) && n.parentId === groupId)
        .map((n) => n.id)
    ),
  };
}

/**
 * Apply an editor save: insert or replace `draft`, slotting it into its
 * domain's group when the domain is new or changed, and un-grouping it when
 * the domain is cleared.
 *
 * `expandTarget` comes from `resolveExpandTarget` above; pass null when the
 * save does not file into a collapsed group. The edge half of that expansion
 * is the caller's (`expandGroupEdges`), because it operates on the other list.
 */
export function saveClaimNode(
  nodes: GraphNode[],
  draft: ClaimNode,
  mode: LayoutMode,
  expandTarget: ExpandTarget | null
): GraphNode[] {
  const idx = nodes.findIndex((n) => n.id === draft.id);
  const isNew = idx < 0;
  const existing = isNew ? null : nodes[idx];

  // Keep a node exactly where it sits, preserving its parent. Used for every
  // edit that does not move the claim between domains, so a manually-placed
  // claim is never yanked back into a grid slot by an unrelated title change.
  const inPlace = (): GraphNode[] => {
    const merged: ClaimNode = {
      ...draft,
      position: existing!.position,
      ...(existing!.parentId
        ? { parentId: existing!.parentId, extent: "parent" as const }
        : {}),
    };
    const next = nodes.slice();
    next[idx] = merged;
    return next;
  };

  // Inline mode has no groups: append on create, preserve position on edit.
  if (mode !== "fullbleed") {
    if (isNew) return [...nodes, draft];
    return inPlace();
  }

  const domain = draft.data.domain;
  const currentDomain =
    existing && isClaimNode(existing) ? existing.data.domain : undefined;
  const domainChanged = isNew || domain !== currentDomain;
  if (!domainChanged) return inPlace();

  // New claim, or its domain changed, so (re)slot it. Removing the old
  // instance first lets recomputeGroupBounds shrink the group it left.
  const layout = LAYOUT[mode];
  let working = nodes.filter((n) => n.id !== draft.id);

  if (domain) {
    const groupId = `__domain_${domain}`;
    if (!working.some((n) => n.id === groupId)) {
      working = [...working, makeDomainGroupNode(domain, working, mode)];
    }
    // The target group is collapsed: expand it, so the claim lands somewhere
    // the user can see. Hiding it inside the pill would be consistent with the
    // chevron but reads as the save having done nothing. Either way the old
    // behaviour was wrong — it left the claim visible and detached below the
    // 220x56 pill, drawing edges to siblings that were hidden.
    if (expandTarget) {
      working = expandGroupNodes(
        working,
        expandTarget.groupId,
        expandTarget.childIds,
        mode
      );
    }
    const row = draft.data.row;
    let col = 0;
    for (const n of working) {
      if (isClaimNode(n) && n.parentId === groupId && n.data.row === row) col++;
    }
    const placed: ClaimNode = {
      ...draft,
      parentId: groupId,
      extent: "parent",
      position: {
        x: layout.padX + col * (layout.nodeW + layout.colGap),
        y: layout.padY + layout.groupHeaderH + layout.rowY[row],
      },
      data: { ...draft.data, col },
    };
    working = [...working, placed];
  } else {
    // Domain cleared, so ungroup. Convert the old local position to absolute
    // or the claim jumps to the origin.
    let position = draft.position;
    if (existing && isClaimNode(existing) && existing.parentId) {
      const parent = nodes.find((n) => n.id === existing.parentId);
      if (parent) {
        position = {
          x: parent.position.x + existing.position.x,
          y: parent.position.y + existing.position.y,
        };
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { parentId: _p, extent: _e, ...rest } = draft;
    working = [...working, { ...rest, position } as ClaimNode];
  }

  return orderParentsFirst(recomputeGroupBounds(working, mode));
}

/**
 * Reparent the selected claims into a named domain group, creating the group
 * if it does not exist yet.
 *
 * Moved claims append into clean, non-overlapping grid slots counted from the
 * target group's *existing* children, so the result is predictable rather than
 * a pile at whatever coordinates the claims happened to carry.
 */
export function groupClaimsInto(
  nodes: GraphNode[],
  selectedIds: Set<string>,
  domainName: string,
  mode: LayoutMode
): GraphNode[] {
  const layout = LAYOUT[mode];
  const groupId = `__domain_${domainName}`;
  let working = nodes.some((n) => n.id === groupId)
    ? nodes.slice()
    : [...nodes, makeDomainGroupNode(domainName, nodes, mode)];

  const nextCol: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const n of working) {
    if (isClaimNode(n) && n.parentId === groupId && !selectedIds.has(n.id)) {
      nextCol[n.data.row] = nextCol[n.data.row] + 1;
    }
  }

  const slotFor = (row: 1 | 2 | 3) => {
    const col = nextCol[row];
    nextCol[row] = col + 1;
    return {
      x: layout.padX + col * (layout.nodeW + layout.colGap),
      y: layout.padY + layout.groupHeaderH + layout.rowY[row],
    };
  };

  working = working.map((n) => {
    if (!isClaimNode(n) || !selectedIds.has(n.id)) return n;
    const row = n.data.row;
    const position = slotFor(row);
    return {
      ...n,
      parentId: groupId,
      extent: "parent" as const,
      position,
      data: { ...n.data, domain: domainName, col: nextCol[row] - 1 },
      selected: false,
    };
  });

  return orderParentsFirst(recomputeGroupBounds(working, mode));
}

/**
 * Move every selected claim onto an explicit row (1 symptom, 2 mechanism,
 * 3 leverage).
 *
 * `data.row` and `position.y` move together so the semantic layer cannot
 * desync from the visual one: `rfToEngine` serializes `data.row` verbatim, so
 * a claim drawn on the leverage row while carrying row 1 exports as a symptom.
 * Y lives in each node's own coordinate space, which is why it is computed per
 * node: grouped children are relative to their group, ungrouped claims are
 * absolute, and a mixed selection contains both.
 */
export function moveClaimsToRow(
  nodes: GraphNode[],
  selectedIds: Set<string>,
  targetRow: 1 | 2 | 3,
  mode: LayoutMode
): GraphNode[] {
  const layout = LAYOUT[mode];
  const rowYFor = (n: ClaimNode) =>
    n.parentId
      ? layout.padY + layout.groupHeaderH + layout.rowY[targetRow]
      : layout.rowY[targetRow];

  return nodes.map((n) => {
    if (!isClaimNode(n) || !selectedIds.has(n.id)) return n;
    return {
      ...n,
      position: { ...n.position, y: rowYFor(n) },
      data: { ...n.data, row: targetRow },
    };
  });
}

/**
 * Horizontal align / distribute. Pure-positional (X only) — rows carry
 * semantic meaning, so Y belongs to `moveClaimsToRow`.
 *
 * Selected claims may live in different groups, so the boxes handed to
 * `compute` are in absolute X and the result is converted back per node. A
 * grouped claim is clamped to the group's left padding, since a negative local
 * X would put it outside its own parent.
 */
export function applyXPositions(
  nodes: GraphNode[],
  selectedIds: Set<string>,
  compute: (boxes: XBox[]) => Map<string, number>,
  mode: LayoutMode
): GraphNode[] {
  const layout = LAYOUT[mode];
  const groupX = new Map<string, number>();
  for (const n of nodes) {
    if (isGroupNode(n)) groupX.set(n.id, n.position.x);
  }
  const offsetOf = (n: ClaimNode) => (n.parentId ? groupX.get(n.parentId) ?? 0 : 0);

  const boxes: XBox[] = nodes
    .filter((n): n is ClaimNode => isClaimNode(n) && selectedIds.has(n.id))
    .map((n) => ({ id: n.id, x: offsetOf(n) + n.position.x, w: layout.nodeW }));

  const result = compute(boxes);
  if (result.size === 0) return nodes;

  const next = nodes.map((n) => {
    if (!isClaimNode(n) || !result.has(n.id)) return n;
    const absX = result.get(n.id)!;
    let localX = absX - offsetOf(n);
    if (n.parentId) localX = Math.max(layout.padX, localX);
    return { ...n, position: { ...n.position, x: localX } };
  });
  return recomputeGroupBounds(next, mode);
}

/**
 * The claim ids belonging to one domain. Read from the committed graph so the
 * membership a filter is applied with cannot change between the node pass and
 * the edge pass.
 */
export function claimsInDomain(nodes: GraphNode[], domain: string): Set<string> {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (isClaimNode(n) && n.data.domain === domain) ids.add(n.id);
  }
  return ids;
}

/**
 * Mark claims outside the active domain. `inDomain` of null means no filter is
 * active and every flag clears. Nodes whose flag already reads correctly are
 * returned by identity, which is what keeps the filter effect from re-rendering
 * the whole canvas on every unrelated change.
 */
export function applyNodeDomainFlags(
  nodes: GraphNode[],
  inDomain: Set<string> | null
): GraphNode[] {
  return nodes.map((n) => {
    if (!isClaimNode(n)) return n;
    const out = inDomain !== null && !inDomain.has(n.id);
    if (n.data.outOfDomain === out) return n;
    return { ...n, data: { ...n.data, outOfDomain: out } };
  });
}

/**
 * The edge half: an edge is out of domain unless both of its endpoints are in.
 */
export function applyEdgeDomainFlags(
  edges: ClaimEdge[],
  inDomain: Set<string> | null
): ClaimEdge[] {
  return edges.map((e) => {
    const out =
      inDomain !== null && !(inDomain.has(e.source) && inDomain.has(e.target));
    if ((e.data?.outOfDomain ?? false) === out) return e;
    return { ...e, data: { ...e.data!, outOfDomain: out } };
  });
}
