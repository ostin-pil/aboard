"use client";

import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
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
import { ClaimEdge as ClaimEdgeComp } from "./ClaimEdge";
import { ClaimNode as ClaimNodeComp } from "./ClaimNode";
import { EdgeEditorModal } from "./EdgeEditorModal";
import { EdgePopover } from "./EdgePopover";
import { engineToRF, rfToEngine } from "./engine-to-rf";
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
import type { ClaimEdge, ClaimNode } from "./types";

const NODE_TYPES: NodeTypes = { claim: ClaimNodeComp };
const EDGE_TYPES: EdgeTypes = { claim: ClaimEdgeComp };
const HISTORY_LIMIT = 60;

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

  const [nodes, setNodes, onNodesChange] = useNodesState<ClaimNode>(initial.nodes);
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
    kind: EngineEdge["kind"];
    isNew: boolean;
  } | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | "all">("all");

  const wrapperRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const historyRef = useRef<{ stack: { nodes: ClaimNode[]; edges: ClaimEdge[] }[]; idx: number }>({
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
      nodes: nodesRef.current.map((n) => ({ ...n, data: { ...n.data } })),
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
          setNodes(snap.nodes.map((n) => ({ ...n, data: { ...n.data } })));
          setEdges(snap.edges.map((e) => ({ ...e, data: { ...e.data! } })));
          requestAnimationFrame(persist);
        }
      },
      redo: () => {
        const h = historyRef.current;
        if (h.idx < h.stack.length - 1) {
          h.idx++;
          const snap = h.stack[h.idx];
          setNodes(snap.nodes.map((n) => ({ ...n, data: { ...n.data } })));
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
        exportClientJSONLD(nodesRef.current, edgesRef.current, data.domain),
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

  // Apply domain filter by mutating outOfDomain flags.
  useEffect(() => {
    if (activeDomain === "all") {
      setNodes((ns) =>
        ns.map((n) => (n.data.outOfDomain ? { ...n, data: { ...n.data, outOfDomain: false } } : n))
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
      if (n.data.domain === activeDomain) inDomain.add(n.id);
    }
    setNodes((ns) =>
      ns.map((n) => {
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
      if (fromN && toN) {
        if (fromN.data.kind === "leverage") kind = "reduces";
        else if (fromN.data.row === toN.data.row) kind = "moderates";
      }
      setEditingEdge({ source: c.source, target: c.target, kind, isNew: true });
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
    (deleted: ClaimNode[]) => {
      const ids = new Set(deleted.map((n) => n.id));
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
    while (nodesRef.current.some((n) => n.id === prefix + i)) i++;
    return prefix + i;
  }, []);

  const existingRowsCount = useCallback((row: 1 | 2 | 3) => {
    return nodesRef.current.filter((n) => n.data.row === row).length;
  }, []);

  const onNodeSave = useCallback(
    (draft: ClaimNode) => {
      setNodes((ns) => {
        const idx = ns.findIndex((n) => n.id === draft.id);
        if (idx >= 0) {
          const next = ns.slice();
          next[idx] = draft;
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
      openNodePopover: (n, anchor) => setPopoverNode({ node: n, anchor }),
      openEdgePopover: (e, anchor, ev) =>
        setPopoverEdge({ edge: e, anchor, cursor: ev }),
      scheduleCloseEdgePopover,
      cancelCloseEdgePopover,
      openNodeEditor: (n) => setEditingNode({ node: n }),
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
    }),
    [editable, mode, focusId, isNeighbor, scheduleCloseEdgePopover, cancelCloseEdgePopover]
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
        <ReactFlow<ClaimNode, ClaimEdge>
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

