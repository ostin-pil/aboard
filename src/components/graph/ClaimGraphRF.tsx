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
import { EdgeMarkerDefs } from "./EdgeMarkers";
import { EdgePopover } from "./EdgePopover";
import { alignColumn, distributeX, type XBox } from "./align";
import {
  collapseGroupEdges,
  collapseGroupNodes,
  engineToRF,
  expandGroupEdges,
  expandGroupNodes,
  recomputeGroupBounds,
  rfToEngine,
} from "./engine-to-rf";
import {
  applyEdgeDomainFlags,
  applyNodeDomainFlags,
  applyXPositions,
  claimsInDomain,
  groupClaimsInto,
  moveClaimsToRow,
  resolveExpandTarget,
  saveClaimNode,
} from "./graph-ops";
import { GraphContext, type GraphContextValue } from "./GraphContext";
import { exportClientJSONLD } from "./jsonld-export";
import { NodeEditorModal } from "./NodeEditorModal";
import { NodePopover } from "./NodePopover";
import { RowLabels } from "./RowLabels";
import {
  clearPersisted,
  computeSeedHash,
  hydrateFromPersisted,
  loadPersisted,
  pruneLegacyStoreKeys,
  savePersisted,
} from "./persist";
import { mintClaimId } from "./mint-id";
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
  // Seed the initial React Flow state once: the canonical build plus its seed
  // hash, or a validated persisted sandbox (fullbleed only). Runs at mount and
  // when data/mode change.
  const initial = useMemo(() => {
    const canonical = engineToRF(data, mode);
    const seedHash = computeSeedHash(canonical.nodes);
    // Inline is a read-only display of canonical data/: it has no edit
    // affordances and nothing worth persisting. The persisted sandbox belongs
    // to fullbleed (/graph); reading it here put a visitor's editor state —
    // other domains, deleted seeds, collapsed groups — on the landing page,
    // and let its group chevrons write back to the shared key. Build fresh.
    if (mode === "inline") {
      return { ...canonical, seedHash, seedDrift: false, dropStored: false };
    }
    const loaded = loadPersisted(seedHash);
    if (loaded.status === "ok") {
      try {
        const hydrated = hydrateFromPersisted(loaded.persisted);
        // Self-heal on schema drift: a fullbleed snapshot must contain at least
        // one domainGroup node. A snapshot pre-dating a structural refactor
        // (e.g. before multi-domain landed) would rehydrate into an inert graph
        // — drop it and rebuild. Load-bearing; see knowledge/issues.md.
        if (hydrated.nodes.some(isGroupNode)) {
          return {
            ...hydrated,
            seedHash,
            seedDrift: loaded.seedDrift,
            dropStored: false,
          };
        }
      } catch {
        // Validated by Zod but still unhydratable: belt-and-braces, since the
        // hydrate runs in render and a throw here would white-screen the route.
        // Fall through to rebuild from canonical.
      }
    }
    // Nothing usable was stored. `dropStored` asks the effect below to delete
    // what is there; the deletion cannot happen here, in render.
    return {
      ...canonical,
      seedHash,
      seedDrift: false,
      dropStored: loaded.status !== "empty",
    };
  }, [data, mode]);

  // The storage writes the memo above used to make mid-render: dropping a
  // snapshot this render just rejected, and pruning the pre-v3 keys. Render must
  // stay side-effect-free — React may run it twice or discard it entirely, and a
  // discarded render had already deleted the user's sandbox. Effects run after
  // commit, and both writes are idempotent under StrictMode's double-invoke.
  useEffect(() => {
    if (mode === "inline") return; // inline never touches the sandbox key
    pruneLegacyStoreKeys();
    if (initial.dropStored) clearPersisted();
  }, [mode, initial]);

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
  // Mirror the latest nodes/edges into refs so the stable callbacks below (undo,
  // persist, id-minting) read current state without being recreated on every
  // change. Written in an effect, not during render: a ref must not be mutated
  // while rendering, and these are only read from event handlers that run after
  // commit, so the one-commit lag is immaterial.
  // `editable` and "is an editor modal open" are mirrored for the same reason,
  // with one extra wrinkle: the chrome captures `buildInstance()` once in
  // `onReady` and holds that object forever, so a guard closing over either
  // value directly would freeze at its mount-time reading and let the
  // shortcuts mutate a read-only canvas anyway.
  const editableRef = useRef(editable);
  const editorOpenRef = useRef(false);
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    editableRef.current = editable;
    editorOpenRef.current = editingNode !== null || editingEdge !== null;
  });

  const historyRef = useRef<{ stack: { nodes: GraphNode[]; edges: ClaimEdge[] }[]; idx: number }>({
    stack: [{ nodes: initial.nodes, edges: initial.edges }],
    idx: 0,
  });

  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // Center point for a newly-created node, in flow coords. A callback the modal
  // invokes at save time, not a value read during the parent's render, so no
  // ref/layout is touched while rendering.
  const getDefaultNodePosition = useCallback((): { x: number; y: number } => {
    const wrap = wrapperRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const r = wrap.getBoundingClientRect();
    return rf.screenToFlowPosition({
      x: r.left + r.width / 2 - 120,
      y: r.top + r.height / 2 - 40,
    });
  }, [rf]);

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
    savePersisted(nodesRef.current, edgesRef.current, initial.seedHash);
  }, [initial.seedHash]);

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
      if (!nextCollapsed) {
        // The expand half is shared with `onNodeSave`, which has to run it when
        // a claim is filed into a collapsed group.
        setNodes((ns) => expandGroupNodes(ns, groupId, childIds, mode));
        setEdges((es) => expandGroupEdges(es, childIds));
      } else {
        setNodes((ns) => collapseGroupNodes(ns, groupId, childIds));
        setEdges((es) => collapseGroupEdges(es, groupId, childIds));
      }
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

  // Restore a history snapshot, replaying the post-processing the live collapse
  // path does. Undo/redo change group style.width/height directly; React Flow
  // does not re-measure on its own, so its cached `measured` dims go stale and
  // the collapsed pill becomes undraggable and its expand chevron unhittable
  // (the exact wedge toggleDomainCollapse guards against at :322-338). So after
  // restoring: recompute bounds for expanded groups (collapsed ones are skipped
  // inside recomputeGroupBounds), then force a re-measure of every group.
  const restoreSnapshot = useCallback(
    (snap: { nodes: GraphNode[]; edges: ClaimEdge[] }) => {
      const restored = snap.nodes.map((n) => ({ ...n, data: { ...n.data } } as GraphNode));
      const groupIds = restored.filter(isGroupNode).map((g) => g.id);
      setNodes(groupIds.length ? recomputeGroupBounds(restored, mode) : restored);
      setEdges(snap.edges.map((e) => ({ ...e, data: { ...e.data! } })));
      requestAnimationFrame(() => {
        groupIds.forEach((id) => updateNodeInternals(id));
        persist();
      });
    },
    [setNodes, setEdges, mode, updateNodeInternals, persist]
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
      // The three mutating methods are guarded here rather than at each call
      // site, because the toolbar buttons and the keyboard shortcuts both
      // arrive through this object and only one of them was ever checked.
      //
      // `editable` off means the canvas is a reader. An open editor means a
      // draft is being typed: `n` used to replace `editingNode` and discard it
      // without a word, and an undo behind the modal moved the graph out from
      // under the draft the modal was about to save.
      addNode: () => {
        if (!editableRef.current || editorOpenRef.current) return;
        setEditingNode({ node: null });
      },
      undo: () => {
        if (!editableRef.current || editorOpenRef.current) return;
        const h = historyRef.current;
        if (h.idx > 0) {
          h.idx--;
          restoreSnapshot(h.stack[h.idx]);
        }
      },
      redo: () => {
        if (!editableRef.current || editorOpenRef.current) return;
        const h = historyRef.current;
        if (h.idx < h.stack.length - 1) {
          h.idx++;
          restoreSnapshot(h.stack[h.idx]);
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
      seedDrift: initial.seedDrift,
    };
  }, [data, mode, rf, setNodes, setEdges, restoreSnapshot, initial.seedDrift]);

  // onReady — fire once after first mount.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    const inst = buildInstance();
    onReady?.(inst);
    requestAnimationFrame(() => rf.fitView({ padding: mode === "inline" ? 0.05 : 0.15 }));
  }, [buildInstance, onReady, rf, mode]);

  // Apply the domain filter by setting outOfDomain flags on claims and edges.
  // Membership is read once, from the committed graph, so the node pass and the
  // edge pass cannot disagree about who is in the domain.
  useEffect(() => {
    const inDomain =
      activeDomain === "all" ? null : claimsInDomain(nodesRef.current, activeDomain);
    setNodes((ns) => applyNodeDomainFlags(ns, inDomain));
    setEdges((es) => applyEdgeDomainFlags(es, inDomain));
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
  const newId = useCallback((kind: EngineNode["kind"], domain?: string) => {
    const claims = nodesRef.current
      .filter(isClaimNode)
      .map((n) => ({ id: n.id, domain: n.data.domain }));
    return mintClaimId(kind, domain, claims);
  }, []);

  const existingRowsCount = useCallback((row: 1 | 2 | 3) => {
    return nodesRef.current.filter(
      (n): n is ClaimNode => isClaimNode(n) && n.data.row === row
    ).length;
  }, []);

  const onNodeSave = useCallback(
    (draft: ClaimNode) => {
      // Settled here, against the committed graph, rather than inside the
      // updater below: a state updater has to stay pure, and React may run it
      // twice.
      const expandTarget = resolveExpandTarget(nodesRef.current, draft, mode);

      setNodes((ns) => saveClaimNode(ns, draft, mode, expandTarget));
      // The edge half of the same expansion: un-hide the group's internal edges
      // and un-point its boundary edges from the pill they were aimed at.
      if (expandTarget) {
        setEdges((es) => expandGroupEdges(es, expandTarget.childIds));
      }
      setEditingNode(null);
      requestAnimationFrame(() => {
        // Same re-measure the chevron path needs: the group's style.width and
        // height just changed and React Flow does not notice on its own, so its
        // cached dims stay at the collapsed pill's and the group is undraggable.
        if (expandTarget) updateNodeInternals(expandTarget.groupId);
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [
      mode,
      setNodes,
      setEdges,
      snapshot,
      persist,
      buildInstance,
      onPersist,
      updateNodeInternals,
    ]
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

  const bulkGroupInto = useCallback(
    (domainName: string) => {
      if (selectedClaimIds.length === 0) return;
      const selSet = new Set(selectedClaimIds);
      setNodes((ns) => groupClaimsInto(ns, selSet, domainName, mode));
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [selectedClaimIds, mode, setNodes, snapshot, persist, buildInstance, onPersist]
  );

  const bulkMoveToRow = useCallback(
    (targetRow: 1 | 2 | 3) => {
      if (selectedClaimIds.length < 1) return;
      const selSet = new Set(selectedClaimIds);
      setNodes((ns) => moveClaimsToRow(ns, selSet, targetRow, mode));
      requestAnimationFrame(() => {
        snapshot();
        persist();
        onPersist?.(buildInstance());
      });
    },
    [selectedClaimIds, mode, setNodes, snapshot, persist, buildInstance, onPersist]
  );

  const applyXResult = useCallback(
    (compute: (boxes: XBox[]) => Map<string, number>) => {
      if (selectedClaimIds.length < 2) return;
      const selSet = new Set(selectedClaimIds);
      setNodes((ns) => applyXPositions(ns, selSet, compute, mode));
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
      <EdgeMarkerDefs />

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
          availableDomains={availableDomains}
          defaultDomain={activeDomain !== "all" ? activeDomain : undefined}
          getDefaultPosition={getDefaultNodePosition}
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
