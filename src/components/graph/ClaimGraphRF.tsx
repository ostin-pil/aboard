"use client";

import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BulkActionsToolbar } from "./BulkActionsToolbar";
import { ClaimEdge as ClaimEdgeComp } from "./ClaimEdge";
import { ClaimNode as ClaimNodeComp } from "./ClaimNode";
import { DomainGroupNode as DomainGroupNodeComp } from "./DomainGroupNode";
import { EdgeEditorModal } from "./EdgeEditorModal";
import { EdgePopover } from "./EdgePopover";
import { alignColumn, distributeX, type XBox } from "./align";
import {
  LAYOUT,
  engineToRF,
  recomputeGroupBounds,
  rfToEngine,
} from "./engine-to-rf";
import { GraphContext, type GraphContextValue } from "./GraphContext";
import { exportClientJSONLD } from "./jsonld-export";
import { NodeEditorModal } from "./NodeEditorModal";
import { NodePopover } from "./NodePopover";
import { RowLabels } from "./RowLabels";
import {
  clearPersisted,
  hydrateFromPersisted,
  loadPersisted,
  savePersisted,
} from "./persist";
import {
  isClaimNode,
  isGroupNode,
  orderParentsFirst,
  type ClaimEdge,
  type ClaimNode,
  type GraphNode,
} from "./types";

const NODE_TYPES: NodeTypes = {
  claim: ClaimNodeComp,
  domainGroup: DomainGroupNodeComp,
};
const EDGE_TYPES: EdgeTypes = { claim: ClaimEdgeComp };
const HISTORY_LIMIT = 60;

const COLLAPSED_GROUP_W = 220;
const COLLAPSED_GROUP_H = 56;

type Props = {
  data: EngineGraphData;
  mode: "inline" | "fullbleed";
  editable: boolean;
  onPersist?: (instance: AboardGraphInstance) => void;
  onZoom?: (scale: number) => void;
  onReady?: (instance: AboardGraphInstance) => void;
};

export function ClaimGraphRF(props: Props) {
  return (
    <ReactFlowProvider>
      <ClaimGraphRFInner {...props} />
    </ReactFlowProvider>
  );
}

function ClaimGraphRFInner({
  data,
  mode,
  editable,
  onPersist,
  onZoom,
  onReady,
}: Props) {
  const initial = useMemo(() => {
    const persisted = loadPersisted();
    if (persisted) {
      const hydrated = hydrateFromPersisted(persisted);
      // Self-heal on schema drift: fullbleed mode must contain at
      // least one domainGroup node. A persisted snapshot pre-dating a
      // structural refactor (e.g. before multi-domain landed) would
      // rehydrate into an inert graph — drop it and rebuild from
      // data/. Load-bearing; do not remove without replacing with a
      // smarter drift check. See knowledge/issues.md.
      const schemaOk =
        mode !== "fullbleed" || hydrated.nodes.some(isGroupNode);
      if (schemaOk) return hydrated;
      clearPersisted();
    }
    return engineToRF(data, mode);
  }, [data, mode]);

  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ClaimEdge>(initial.edges);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [popoverNode, setPopoverNode] = useState<{ node: ClaimNode; anchor: HTMLElement } | null>(null);
  const [popoverEdge, setPopoverEdge] = useState<
    | {
        edge: ClaimEdge;
        anchor: HTMLElement | SVGElement;
        cursor?: { clientX: number; clientY: number };
      }
    | null
  >(null);
  const [editingNode, setEditingNode] = useState<{ node: ClaimNode | null } | null>(null);
  const [editingEdge, setEditingEdge] = useState<{
    id?: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    kind: EngineEdge["kind"];
    isNew: boolean;
  } | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | "all">("all");

  const wrapperRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const historyRef = useRef<{ stack: { nodes: GraphNode[]; edges: ClaimEdge[] }[]; idx: number }>({
    stack: [{ nodes: initial.nodes, edges: initial.edges }],
    idx: 0,
  });

  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const closeEdgePopoverTimer = useRef<number | null>(null);
  const cancelCloseEdgePopover = useCallback(() => {
    if (closeEdgePopoverTimer.current) {
      window.clearTimeout(closeEdgePopoverTimer.current);
      closeEdgePopoverTimer.current = null;
    }
  }, []);
  const scheduleCloseEdgePopover = useCallback(() => {
    cancelCloseEdgePopover();
    closeEdgePopoverTimer.current = window.setTimeout(() => {
      setPopoverEdge(null);
      closeEdgePopoverTimer.current = null;
    }, 180);
  }, [cancelCloseEdgePopover]);

  const isNeighbor = useCallback(
    (id: string) => {
      if (focusId == null) return false;
      if (id === focusId) return true;
      for (const e of edgesRef.current) {
        if (e.source === focusId && e.target === id) return true;
        if (e.target === focusId && e.source === id) return true;
      }
      return false;
    },
    [focusId]
  );

  const snapshot = useCallback(() => {
    const h = historyRef.current;
    h.stack.splice(h.idx + 1);
    h.stack.push({
      nodes: nodesRef.current.map((n) => ({ ...n, data: { ...n.data } } as GraphNode)),
      edges: edgesRef.current.map((e) => ({ ...e, data: { ...e.data! } })),
    });
    h.idx = h.stack.length - 1;
    if (h.stack.length > HISTORY_LIMIT) {
      h.stack.shift();
      h.idx = h.stack.length - 1;
    }
  }, []);

  const persist = useCallback(() => {
    savePersisted(nodesRef.current, edgesRef.current);
  }, []);

  // Toggle a domain group's collapsed flag and propagate hidden to children + edges.
  const toggleDomainCollapse = useCallback(
    (groupId: string) => {
      const group = nodesRef.current.find((n) => n.id === groupId);
      if (!group || !isGroupNode(group)) return;
      const nextCollapsed = !group.data.collapsed;
      const childIds = new Set(
        nodesRef.current
          .filter((n): n is ClaimNode => isClaimNode(n) && n.parentId === groupId)
          .map((n) => n.id)
      );
      setNodes((ns) => {
        const mapped = ns.map((n) => {
          if (n.id === groupId && isGroupNode(n)) {
            const next: typeof n = {
              ...n,
              data: { ...n.data, collapsed: nextCollapsed },
              style: nextCollapsed
                ? { ...n.style, width: COLLAPSED_GROUP_W, height: COLLAPSED_GROUP_H }
                : { ...n.style, width: undefined, height: undefined },
            };
            return next;
          }
          if (childIds.has(n.id)) {
            return { ...n, hidden: nextCollapsed } as GraphNode;
          }
          return n;
        });
        // Expand path: width/height were just cleared, so RF would otherwise
        // fall back to the cached collapsed 220×56 box and crush the
        // re-shown children into the corner. Recompute bounds from the now-
        // visible children to restore the real group size.
        return nextCollapsed ? mapped : recomputeGroupBounds(mapped, mode);
      });
      setEdges((es) =>
        es.map((e) => {
          const touchesCollapsed = childIds.has(e.source) || childIds.has(e.target);
          if (!touchesCollapsed) return e;
          return { ...e, hidden: nextCollapsed };
        })
      );
      requestAnimationFrame(() => {
        // The group's style.width/height just changed; React Flow does
        // not re-measure on its own, so its cached `measured` dims (used
        // for drag coordinate mapping) stay stale and the collapsed pill
        // becomes undraggable. Force a re-measure. See knowledge/issues.md.
        updateNodeInternals(groupId);
        snapshot();
        persist();
      });
    },
    [setNodes, setEdges, snapshot, persist, mode, updateNodeInternals]
  );

  const buildInstance = useCallback((): AboardGraphInstance => {
    return {
      get state() {
        return rfToEngine(
          nodesRef.current,
          edgesRef.current,
          data.domains,
          data.domain
        );
      },
      render: () => {},
      addNode: () => setEditingNode({ node: null }),
      undo: () => {
        const h = historyRef.current;
        if (h.idx > 0) {
          h.idx--;
          const snap = h.stack[h.idx];
          setNodes(snap.nodes.map((n) => ({ ...n, data: { ...n.data } } as GraphNode)));
          setEdges(snap.edges.map((e) => ({ ...e, data: { ...e.data! } })));
          requestAnimationFrame(persist);
        }
      },
      redo: () => {
        const h = historyRef.current;
        if (h.idx < h.stack.length - 1) {
          h.idx++;
          const snap = h.stack[h.idx];
          setNodes(snap.nodes.map((n) => ({ ...n, data: { ...n.data } } as GraphNode)));
          setEdges(snap.edges.map((e) => ({ ...e, data: { ...e.data! } })));
          requestAnimationFrame(persist);
        }
      },
      fitView: () => rf.fitView({ duration: 200, padding: 0.15 }),
      zoomIn: () => rf.zoomIn({ duration: 150 }),
      zoomOut: () => rf.zoomOut({ duration: 150 }),
      zoom: () => rf.getZoom(),
      reset: () => {
        clearPersisted();
        // Reset returns to the canonical seed fully expanded. Collapsed
        // state is intentionally discarded — it lives only in the
        // persisted graph (STORE_KEY), which clearPersisted just removed.
        const built = engineToRF(data, mode);
        setNodes(built.nodes);
        setEdges(built.edges);
        historyRef.current = { stack: [{ nodes: built.nodes, edges: built.edges }], idx: 0 };
        requestAnimationFrame(() => rf.fitView({ duration: 200, padding: 0.15 }));
      },
      exportJSONLD: () =>
        exportClientJSONLD(
          nodesRef.current.filter(isClaimNode),
          edgesRef.current,
          data.domain
        ),
      setActiveDomain: (d) => setActiveDomain(d),
    };
  }, [data, mode, rf, setNodes, setEdges, persist, updateNodeInternals]);

  // onReady — fire once after first mount.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    const inst = buildInstance();
    onReady?.(inst);
    requestAnimationFrame(() => rf.fitView({ padding: mode === "inline" ? 0.05 : 0.15 }));
  }, [buildInstance, onReady, rf, mode]);

  // Apply domain filter by mutating outOfDomain flags on claim nodes / edges.
  useEffect(() => {
    if (activeDomain === "all") {
      setNodes((ns) =>
        ns.map((n) => {
          if (!isClaimNode(n) || !n.data.outOfDomain) return n;
          return { ...n, data: { ...n.data, outOfDomain: false } };
        })
      );
      setEdges((es) =>
        es.map((e) =>
          e.data?.outOfDomain
            ? { ...e, data: { ...e.data, outOfDomain: false } }
            : e
        )
      );
      return;
    }
    const inDomain = new Set<string>();
    for (const n of nodesRef.current) {
      if (isClaimNode(n) && n.data.domain === activeDomain) inDomain.add(n.id);
    }
    setNodes((ns) =>
      ns.map((n) => {
        if (!isClaimNode(n)) return n;
        const out = !inDomain.has(n.id);
        if (n.data.outOfDomain === out) return n;
        return { ...n, data: { ...n.data, outOfDomain: out } };
      })
    );
    setEdges((es) =>
      es.map((e) => {
        const out = !(inDomain.has(e.source) && inDomain.has(e.target));
        if (e.data?.outOfDomain === out) return e;
        return { ...e, data: { ...(e.data!), outOfDomain: out } };
      })
    );
  }, [activeDomain, setNodes, setEdges]);

  // onZoom — track viewport zoom changes.
  const onMoveEnd = useCallback(
    () => {
      if (onZoom) onZoom(rf.getZoom());
    },
    [onZoom, rf]
  );

  // onConnect — open editor for the proposed edge.
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const fromN = nodesRef.current.find((n) => n.id === c.source);
      const toN = nodesRef.current.find((n) => n.id === c.target);
      let kind: EngineEdge["kind"] = "causes";
      if (fromN && toN && isClaimNode(fromN) && isClaimNode(toN)) {
        if (fromN.data.kind === "leverage") kind = "reduces";
        else if (fromN.data.row === toN.data.row) kind = "moderates";
      }
      // "full-target" is the body-overlay handle that only mounts during a
      // drag; an edge can't attach to it at rest. Normalize transient overlay
      // handles to null so the edge binds to the persistent default handle.
      const norm = (h: string | null | undefined) =>
        !h || h.startsWith("full-") ? null : h;
      setEditingEdge({
        source: c.source,
        target: c.target,
        sourceHandle: norm(c.sourceHandle),
        targetHandle: norm(c.targetHandle),
        kind,
        isNew: true,
      });
    },
    []
  );

  // Persist + history on node-position-change-end (after drag).
  const onNodeDragStop = useCallback(() => {
    snapshot();
    persist();
    onPersist?.(buildInstance());
  }, [snapshot, persist, buildInstance, onPersist]);

  // Backspace/Delete on selected elements — React Flow handles the deletion
  // via deleteKeyCode; we just snapshot + persist after.
  const onNodesDelete = useCallback(
    (deleted: GraphNode[]) => {
      const ids = new Set(deleted.filter(isClaimNode).map((n) => n.id));
      if (ids.size === 0) return;
      setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [setEdges, snapshot, persist, buildInstance, onPersist]
  );
  const onEdgesDelete = useCallback(
    () => {
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [snapshot, persist, buildInstance, onPersist]
  );

  // Editor save/delete handlers.
  const newId = useCallback((kind: EngineNode["kind"]) => {
    const prefix = kind === "symptom" ? "S" : kind === "mechanism" ? "M" : "L";
    let i = 1;
    while (
      nodesRef.current.some((n) => isClaimNode(n) && n.id === prefix + i)
    )
      i++;
    return prefix + i;
  }, []);

  const existingRowsCount = useCallback((row: 1 | 2 | 3) => {
    return nodesRef.current.filter(
      (n): n is ClaimNode => isClaimNode(n) && n.data.row === row
    ).length;
  }, []);

  const onNodeSave = useCallback(
    (draft: ClaimNode) => {
      setNodes((ns) => {
        const idx = ns.findIndex((n) => n.id === draft.id);
        if (idx >= 0) {
          const existing = ns[idx];
          const merged: ClaimNode = {
            ...draft,
            position: existing.position,
            ...(existing.parentId
              ? { parentId: existing.parentId, extent: "parent" as const }
              : {}),
          };
          const next = ns.slice();
          next[idx] = merged;
          return next;
        }
        return [...ns, draft];
      });
      setEditingNode(null);
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [setNodes, snapshot, persist, buildInstance, onPersist]
  );

  const onNodeDelete = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setEditingNode(null);
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [setNodes, setEdges, snapshot, persist, buildInstance, onPersist]
  );

  const onEdgeSave = useCallback(
    (kind: EngineEdge["kind"]) => {
      if (!editingEdge) return;
      if (editingEdge.isNew) {
        setEdges((es) => {
          const newEdge: ClaimEdge = {
            id: `${editingEdge.source}->${editingEdge.target}#${kind}#${Date.now()}`,
            type: "claim",
            source: editingEdge.source,
            target: editingEdge.target,
            ...(editingEdge.sourceHandle
              ? { sourceHandle: editingEdge.sourceHandle }
              : {}),
            ...(editingEdge.targetHandle
              ? { targetHandle: editingEdge.targetHandle }
              : {}),
            data: {
              kind,
              rationale: "",
              sources: [],
              crossDomain: false,
              outOfDomain: false,
            },
          };
          return [...es, newEdge];
        });
      } else {
        setEdges((es) =>
          es.map((e) =>
            e.id === editingEdge.id
              ? { ...e, data: { ...(e.data!), kind } }
              : e
          )
        );
      }
      setEditingEdge(null);
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [editingEdge, setEdges, snapshot, persist, buildInstance, onPersist]
  );

  const selectedClaimIds = useMemo(
    () =>
      nodes
        .filter((n): n is ClaimNode => isClaimNode(n) && !!n.selected)
        .map((n) => n.id),
    [nodes]
  );

  const bulkDelete = useCallback(() => {
    if (selectedClaimIds.length === 0) return;
    rf.deleteElements({ nodes: selectedClaimIds.map((id) => ({ id })) });
  }, [rf, selectedClaimIds]);

  const bulkClearSelection = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => (n.selected ? { ...n, selected: false } : n))
    );
  }, [setNodes]);

  // Group selected claims into a named domain. Creates the domain group node
  // if it doesn't already exist, reparents the claims (converting absolute
  // positions to parent-relative), then recomputes group bounds.
  const bulkGroupInto = useCallback(
    (domainName: string) => {
      if (selectedClaimIds.length === 0) return;
      const selSet = new Set(selectedClaimIds);
      const layout = LAYOUT[mode];

      setNodes((ns) => {
        const groupId = `__domain_${domainName}`;
        const groupExists = ns.some((n) => n.id === groupId);

        let working = ns.slice();

        if (!groupExists) {
          // Synthesize new group node to the right of the last existing one.
          let maxRight = 0;
          for (const n of working) {
            if (isGroupNode(n)) {
              const w = (n.style?.width as number | undefined) ?? 600;
              maxRight = Math.max(maxRight, n.position.x + w);
            }
          }
          const newGroup = {
            id: groupId,
            type: "domainGroup" as const,
            position: {
              x: maxRight === 0 ? 0 : maxRight + layout.groupGapX,
              y: 0,
            },
            data: {
              domain: domainName,
              claimCount: 0,
              collapsed: false,
            },
            style: {
              width: layout.padX * 2 + layout.nodeW + 200,
              height: layout.rowY[3] + layout.groupHeaderH + 96,
            },
            draggable: false,
            selectable: false,
            focusable: false,
          } as GraphNode;
          working = [...working, newGroup];
        }

        // Next free column per row among the target group's *existing*
        // children (claims not being moved). Moved claims append into clean,
        // non-overlapping grid slots so the result is predictable.
        const nextCol: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
        for (const n of working) {
          if (
            isClaimNode(n) &&
            n.parentId === groupId &&
            !selSet.has(n.id)
          ) {
            const r = n.data.row;
            nextCol[r] = nextCol[r] + 1;
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

        // Reparent each selected claim into a tidy slot.
        working = working.map((n) => {
          if (!isClaimNode(n) || !selSet.has(n.id)) return n;
          const row = n.data.row;
          const pos = slotFor(row);
          return {
            ...n,
            parentId: groupId,
            extent: "parent" as const,
            position: pos,
            data: { ...n.data, domain: domainName, col: nextCol[row] - 1 },
            selected: false,
          };
        });

        return orderParentsFirst(recomputeGroupBounds(working, mode));
      });

      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [selectedClaimIds, mode, setNodes, snapshot, persist, buildInstance, onPersist]
  );

  // Move every selected claim onto an explicit row (1=symptom, 2=mechanism,
  // 3=leverage). Updates data.row AND position.y together so the semantic
  // layer can't desync from the visual one (rfToEngine serializes data.row
  // verbatim). Unlike the old "row of the first selected" behaviour, ALL
  // selected claims move — there is no skipped anchor node.
  const bulkMoveToRow = useCallback(
    (targetRow: 1 | 2 | 3) => {
      if (selectedClaimIds.length < 1) return;
      const selSet = new Set(selectedClaimIds);
      const layout = LAYOUT[mode];
      // Y lives in each node's own coordinate space — grouped children are
      // relative to their group, ungrouped claims are absolute. Compute per
      // node so a mixed selection lands at the right Y in either space.
      const rowYFor = (n: ClaimNode) =>
        n.parentId
          ? layout.padY + layout.groupHeaderH + layout.rowY[targetRow]
          : layout.rowY[targetRow];

      setNodes((ns) =>
        ns.map((n) => {
          if (!isClaimNode(n) || !selSet.has(n.id)) return n;
          return {
            ...n,
            position: { ...n.position, y: rowYFor(n) },
            data: { ...n.data, row: targetRow },
          };
        })
      );
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [selectedClaimIds, mode, setNodes, snapshot, persist, buildInstance, onPersist]
  );

  // Horizontal align / distribute. Pure-positional (X only) — rows carry
  // semantic meaning so Y is left to bulkMoveToRow. Selected claims may live
  // in different groups, so work in absolute X then convert back per-node.
  const applyXResult = useCallback(
    (compute: (boxes: XBox[]) => Map<string, number>) => {
      if (selectedClaimIds.length < 2) return;
      const selSet = new Set(selectedClaimIds);
      const layout = LAYOUT[mode];

      setNodes((ns) => {
        const groupX = new Map<string, number>();
        for (const n of ns) {
          if (isGroupNode(n)) groupX.set(n.id, n.position.x);
        }
        const offsetOf = (n: ClaimNode) =>
          n.parentId ? groupX.get(n.parentId) ?? 0 : 0;

        const boxes: XBox[] = ns
          .filter((n): n is ClaimNode => isClaimNode(n) && selSet.has(n.id))
          .map((n) => ({
            id: n.id,
            x: offsetOf(n) + n.position.x,
            w: layout.nodeW,
          }));

        const result = compute(boxes);
        if (result.size === 0) return ns;

        const next = ns.map((n) => {
          if (!isClaimNode(n) || !result.has(n.id)) return n;
          const absX = result.get(n.id)!;
          let localX = absX - offsetOf(n);
          if (n.parentId) localX = Math.max(layout.padX, localX);
          return { ...n, position: { ...n.position, x: localX } };
        });
        return recomputeGroupBounds(next, mode);
      });
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [selectedClaimIds, mode, setNodes, snapshot, persist, buildInstance, onPersist]
  );

  const bulkAlignColumn = useCallback(
    () => applyXResult((boxes) => alignColumn(boxes)),
    [applyXResult]
  );
  const bulkDistributeX = useCallback(
    () => applyXResult((boxes) => distributeX(boxes)),
    [applyXResult]
  );

  const availableDomains = useMemo(() => {
    const out = new Set<string>();
    for (const n of nodes) {
      if (isGroupNode(n)) out.add(n.data.domain);
      else if (isClaimNode(n) && n.data.domain) out.add(n.data.domain);
    }
    return Array.from(out).sort();
  }, [nodes]);

  const onEdgeDelete = useCallback(() => {
    if (!editingEdge?.id) {
      setEditingEdge(null);
      return;
    }
    setEdges((es) => es.filter((e) => e.id !== editingEdge.id));
    setEditingEdge(null);
    requestAnimationFrame(() => {
      snapshot();
      persist();
      onPersist?.(buildInstance());
    });
  }, [editingEdge, setEdges, snapshot, persist, buildInstance, onPersist]);

  // Default edge marker per kind.
  const defaultEdgeOptions = useMemo(
    () => ({
      type: "claim",
    }),
    []
  );

  const ctx: GraphContextValue = useMemo(
    () => ({
      editable,
      mode,
      focusId,
      setFocusId,
      openNodePopover: (id, anchor) => {
        const live = nodesRef.current.find((n) => n.id === id);
        if (live && isClaimNode(live)) setPopoverNode({ node: live, anchor });
      },
      openEdgePopover: (e, anchor, ev) =>
        setPopoverEdge({ edge: e, anchor, cursor: ev }),
      scheduleCloseEdgePopover,
      cancelCloseEdgePopover,
      openNodeEditor: (id) => {
        if (id === null) {
          setEditingNode({ node: null });
          return;
        }
        const live = nodesRef.current.find((n) => n.id === id);
        if (live && isClaimNode(live)) setEditingNode({ node: live });
      },
      openEdgeEditor: (e) => {
        if ("data" in e && e.data) {
          const ee = e as ClaimEdge;
          setEditingEdge({
            id: ee.id,
            source: ee.source,
            target: ee.target,
            kind: ee.data?.kind ?? "causes",
            isNew: false,
          });
        } else {
          const ne = e as { source: string; target: string; kind: EngineEdge["kind"] };
          setEditingEdge({ ...ne, isNew: true });
        }
      },
      isNeighbor,
      toggleDomainCollapse,
    }),
    [
      editable,
      mode,
      focusId,
      isNeighbor,
      scheduleCloseEdgePopover,
      cancelCloseEdgePopover,
      toggleDomainCollapse,
    ]
  );

  // Refit on resize.
  useLayoutEffect(() => {
    const onResize = () => rf.fitView({ padding: mode === "inline" ? 0.05 : 0.15 });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [rf, mode]);

  const isInline = mode === "inline";

  return (
    <div ref={wrapperRef} className={`ag-rf-root ag-rf-${mode}`}>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <defs>
          <marker
            id="ag-rf-ah-causes"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth={6.5}
            markerHeight={6.5}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" fill="var(--edge-causes)" />
          </marker>
          <marker
            id="ag-rf-ah-reduces"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth={6.5}
            markerHeight={6.5}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" fill="var(--edge-reduces)" />
          </marker>
        </defs>
      </svg>

      <GraphContext.Provider value={ctx}>
        <ReactFlow<GraphNode, ClaimEdge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={editable ? onConnect : undefined}
          onNodeDragStop={editable ? onNodeDragStop : undefined}
          onNodesDelete={editable ? onNodesDelete : undefined}
          onEdgesDelete={editable ? onEdgesDelete : undefined}
          onMoveEnd={onMoveEnd}
          // Load-bearing: @xyflow/react v12 only wires up React's click
          // event for nodes when an onNodeClick prop is present. Without
          // it, clicks on interactive children inside a custom node
          // (e.g. the DomainGroupNode header button, even with `nodrag
          // nopan`) are silently dropped — the inner onClick never
          // fires. A no-op is sufficient; we have no node-click semantics
          // of our own. Removing this re-introduces the regression
          // bisected on 2026-05-20.
          onNodeClick={() => { /* noop — see above */ }}
          deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
          multiSelectionKeyCode={["Meta", "Control"]}
          selectionKeyCode="Shift"
          selectionMode={SelectionMode.Partial}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={{ padding: isInline ? 0.05 : 0.15 }}
          panOnDrag={!isInline}
          panOnScroll={false}
          zoomOnScroll={!isInline}
          zoomOnPinch={!isInline}
          zoomOnDoubleClick={false}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={!isInline}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          minZoom={0.4}
          maxZoom={2}
        >
          {!isInline && <Background gap={24} size={1} color="var(--line)" />}
          {!isInline && <Controls showInteractive={false} />}
          {!isInline && <RowLabels />}
          {!isInline && editable && (
            <Panel position="bottom-right" className="ag-rf-key-hints">
              <span><kbd>⇧</kbd>+drag box-select</span>
              <span><kbd>⌘</kbd>+click add</span>
              <span><kbd>⌫</kbd> delete</span>
            </Panel>
          )}
          {!isInline && editable && selectedClaimIds.length >= 2 && (
            <Panel position="top-center" className="ag-bulk-panel">
              <BulkActionsToolbar
                count={selectedClaimIds.length}
                domains={availableDomains}
                onDelete={bulkDelete}
                onGroupInto={bulkGroupInto}
                onAlignColumn={bulkAlignColumn}
                onDistributeX={bulkDistributeX}
                onMoveToRow={bulkMoveToRow}
                onClear={bulkClearSelection}
              />
            </Panel>
          )}
        </ReactFlow>

        {popoverNode && (
          <NodePopover
            node={popoverNode.node}
            anchor={popoverNode.anchor}
            containerRef={wrapperRef}
            onClose={() => {
              setPopoverNode(null);
              setFocusId(null);
            }}
          />
        )}

        {popoverEdge && (
          <EdgePopover
            edge={popoverEdge.edge}
            anchor={popoverEdge.anchor}
            cursor={popoverEdge.cursor}
            containerRef={wrapperRef}
            onMouseEnter={cancelCloseEdgePopover}
            onMouseLeave={scheduleCloseEdgePopover}
          />
        )}
      </GraphContext.Provider>

      {editingNode && (
        <NodeEditorModal
          node={editingNode.node}
          onSave={onNodeSave}
          onDelete={onNodeDelete}
          onClose={() => setEditingNode(null)}
          newId={newId}
          existingRowsCount={existingRowsCount}
          defaultPosition={(() => {
            const wrap = wrapperRef.current;
            if (!wrap) return { x: 0, y: 0 };
            const r = wrap.getBoundingClientRect();
            return rf.screenToFlowPosition({
              x: r.left + r.width / 2 - 120,
              y: r.top + r.height / 2 - 40,
            });
          })()}
        />
      )}
      {editingEdge && (
        <EdgeEditorModal
          draft={editingEdge}
          onSave={onEdgeSave}
          onDelete={onEdgeDelete}
          onClose={() => setEditingEdge(null)}
        />
      )}
    </div>
  );
}
