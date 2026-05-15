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
import {
  clearPersisted,
  hydrateFromPersisted,
  loadPersisted,
  savePersisted,
} from "./persist";
import {
  isClaimNode,
  isGroupNode,
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
    if (persisted) return hydrateFromPersisted(persisted);
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
      setNodes((ns) =>
        ns.map((n) => {
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
        })
      );
      setEdges((es) =>
        es.map((e) => {
          const touchesCollapsed = childIds.has(e.source) || childIds.has(e.target);
          if (!touchesCollapsed) return e;
          return { ...e, hidden: nextCollapsed };
        })
      );
      requestAnimationFrame(() => {
        snapshot();
        persist();
      });
    },
    [setNodes, setEdges, snapshot, persist]
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
        const fresh = engineToRF(data, mode);
        setNodes(fresh.nodes);
        setEdges(fresh.edges);
        historyRef.current = { stack: [{ nodes: fresh.nodes, edges: fresh.edges }], idx: 0 };
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
  }, [data, mode, rf, setNodes, setEdges, persist]);

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
        let groupExists = ns.some((n) => n.id === groupId);

        // Build a quick lookup of existing group positions.
        const groupPosById = new Map<string, { x: number; y: number }>();
        for (const n of ns) {
          if (isGroupNode(n)) groupPosById.set(n.id, n.position);
        }

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
          groupPosById.set(groupId, newGroup.position);
          groupExists = true;
        }

        const newGroupPos = groupPosById.get(groupId)!;

        // Reparent each selected claim.
        working = working.map((n) => {
          if (!isClaimNode(n) || !selSet.has(n.id)) return n;
          const oldParentPos = n.parentId
            ? groupPosById.get(n.parentId)
            : undefined;
          const absX = (oldParentPos?.x ?? 0) + n.position.x;
          const absY = (oldParentPos?.y ?? 0) + n.position.y;
          const relX = Math.max(layout.padX, absX - newGroupPos.x);
          const relY = Math.max(
            layout.padY + layout.groupHeaderH,
            absY - newGroupPos.y
          );
          return {
            ...n,
            parentId: groupId,
            extent: "parent" as const,
            position: { x: relX, y: relY },
            data: { ...n.data, domain: domainName },
            selected: false,
          };
        });

        return recomputeGroupBounds(working, mode);
      });

      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [selectedClaimIds, mode, setNodes, snapshot, persist, buildInstance, onPersist]
  );

  // Snap all selected claims onto the same row as the first one.
  const bulkAlignSameRow = useCallback(() => {
    if (selectedClaimIds.length < 2) return;
    const selSet = new Set(selectedClaimIds);
    const layout = LAYOUT[mode];
    const first = nodesRef.current.find(
      (n): n is ClaimNode => isClaimNode(n) && n.id === selectedClaimIds[0]
    );
    if (!first) return;
    const targetRow = first.data.row;
    const targetY = first.parentId
      ? layout.padY + layout.groupHeaderH + layout.rowY[targetRow]
      : layout.rowY[targetRow];

    setNodes((ns) =>
      ns.map((n) => {
        if (!isClaimNode(n) || !selSet.has(n.id) || n.id === first.id) return n;
        return {
          ...n,
          position: { ...n.position, y: targetY },
          data: { ...n.data, row: targetRow },
        };
      })
    );
    requestAnimationFrame(() => {
      snapshot();
      persist();
      onPersist?.(buildInstance());
    });
  }, [selectedClaimIds, mode, setNodes, snapshot, persist, buildInstance, onPersist]);

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
                onAlignSameRow={bulkAlignSameRow}
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
