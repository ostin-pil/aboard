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
import {
  canvasAriaLabels,
  withEdgeAriaLabels,
  withNodeAriaLabels,
} from "./aria-labels";
import { BulkActionsToolbar } from "./BulkActionsToolbar";
import {
  edgeAnchorElement,
  focusLeft,
  isNativeActivationTarget,
  resolveCanvasTarget,
} from "./canvas-keys";
import { ClaimEdge as ClaimEdgeComp } from "./ClaimEdge";
import { ClaimNode as ClaimNodeComp } from "./ClaimNode";
import { DomainGroupNode as DomainGroupNodeComp } from "./DomainGroupNode";
import { EdgeEditorModal } from "./EdgeEditorModal";
import { EdgeMarkerDefs } from "./EdgeMarkers";
import { EdgePopover } from "./EdgePopover";
import {
  collapseGroupEdges,
  collapseGroupNodes,
  engineToRF,
  expandGroupEdges,
  expandGroupNodes,
  rfToEngine,
} from "./engine-to-rf";
import {
  applyEdgeDomainFlags,
  applyNodeDomainFlags,
  claimsInDomain,
} from "./graph-ops";
import { GraphContext, type GraphContextValue } from "./GraphContext";
import { exportClientJSONLD } from "./jsonld-export";
import { NodeEditorModal } from "./NodeEditorModal";
import { NodePopover } from "./NodePopover";
import { RowLabels } from "./RowLabels";
import {
  clearPersisted,
  computeSeedHash,
  loadPersisted,
  pruneLegacyStoreKeys,
  savePersisted,
} from "./persist";
import { resolveSeed } from "./seed";
import { useBulkActions } from "./use-bulk-actions";
import { useGraphEditing } from "./use-graph-editing";
import { useGraphHistory } from "./use-graph-history";
import {
  edgeHasPopover,
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
  // when data/mode change. `loadPersisted` is pure, so reading it in render is
  // safe; the write it implies is the effect below.
  const initial = useMemo(() => {
    const canonical = engineToRF(data, mode);
    const seedHash = computeSeedHash(canonical.nodes);
    return resolveSeed(canonical, seedHash, mode, loadPersisted(seedHash));
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
  // `viaKeyboard` and `origin` exist for the same reason: a popover opened from
  // the keyboard has to hand focus back to what opened it, and for an edge that
  // is the edge's own wrapper rather than the label the panel is anchored to.
  const [popoverNode, setPopoverNode] = useState<{
    node: ClaimNode;
    anchor: HTMLElement;
    viaKeyboard: boolean;
  } | null>(null);
  const [popoverEdge, setPopoverEdge] = useState<
    | {
        edge: ClaimEdge;
        anchor: HTMLElement | SVGElement;
        origin?: HTMLElement | SVGElement;
        cursor?: { clientX: number; clientY: number };
      }
    | null
  >(null);
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
  // Same reason again, one step further: `addNode` on the instance opens the
  // node editor, which the editing hook below owns. The hook needs `commit`,
  // `commit` needs the instance, and the instance needs the opener, so one of
  // the three has to be read late. This is the cheapest of them.
  const openNodeEditorRef = useRef<(id: string | null) => void>(() => {});
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    editableRef.current = editable;
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

  const persist = useCallback(() => {
    savePersisted(nodesRef.current, edgesRef.current, initial.seedHash);
  }, [initial.seedHash]);

  const { snapshot, undo, redo, resetHistory } = useGraphHistory({
    initial: { nodes: initial.nodes, edges: initial.edges },
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    mode,
    updateNodeInternals,
    persist,
  });

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
      // Deliberately not `commitNextFrame`: collapsing is a view state, and
      // the chrome's onPersist flashes "saved locally" and re-counts the
      // graph. Neither is true of a chevron. The rest of the bookkeeping is
      // the same, including the re-measure, without which React Flow keeps
      // the group's old cached dims and the collapsed pill is undraggable.
      // See knowledge/issues.md.
      requestAnimationFrame(() => {
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
        openNodeEditorRef.current(null);
      },
      undo: () => {
        if (!editableRef.current || editorOpenRef.current) return;
        undo();
      },
      redo: () => {
        if (!editableRef.current || editorOpenRef.current) return;
        redo();
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
        resetHistory(built);
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
  }, [data, mode, rf, setNodes, setEdges, undo, redo, resetHistory, initial.seedDrift]);

  // The bookkeeping every graph mutation ends with: a new undo step, a write to
  // the persisted sandbox, and the chrome's own callback. It was written out
  // nine times, which is why nine handlers each carried four dependencies they
  // never used for anything else.
  const commit = useCallback(() => {
    snapshot();
    persist();
    onPersist?.(buildInstance());
  }, [snapshot, persist, buildInstance, onPersist]);

  // The same, deferred a frame, which is what a caller wants right after a
  // setState: the refs `commit` reads are mirrored on commit, so running it
  // inline would record the graph as it was before the change. `remeasureGroup`
  // covers the case where a group's box changed size and React Flow has to be
  // told, since its cached dims otherwise stay at the old value.
  const commitNextFrame = useCallback(
    (remeasureGroup?: string) => {
      requestAnimationFrame(() => {
        if (remeasureGroup) updateNodeInternals(remeasureGroup);
        commit();
      });
    },
    [commit, updateNodeInternals]
  );

  const {
    editingNode,
    editingEdge,
    isEditorOpen,
    openNodeEditor,
    openEdgeEditor,
    proposeEdge,
    closeNodeEditor,
    closeEdgeEditor,
    newId,
    existingRowsCount,
    onNodeSave,
    onNodeDelete,
    onEdgeSave,
    onEdgeDelete,
  } = useGraphEditing({
    mode,
    nodesRef,
    setNodes,
    setEdges,
    commitNextFrame,
  });

  // Separate from the mirror effect above, and after the hook that owns these:
  // both are read only from event handlers, so their commit-order relative to
  // the other effects does not matter, while the graph mirror's does.
  useEffect(() => {
    editorOpenRef.current = isEditorOpen;
    openNodeEditorRef.current = openNodeEditor;
  });

  const deleteNodes = useCallback(
    (ids: string[]) => rf.deleteElements({ nodes: ids.map((id) => ({ id })) }),
    [rf]
  );

  const {
    selectedClaimIds,
    bulkDelete,
    bulkClearSelection,
    bulkGroupInto,
    bulkMoveToRow,
    bulkAlignColumn,
    bulkDistributeX,
  } = useBulkActions({ nodes, mode, setNodes, deleteNodes, commitNextFrame });

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

  // Opening a claim's detail popover, from either input. The anchor is React
  // Flow's node wrapper rather than the div `ClaimNode` renders: the wrapper is
  // what holds the tab stop and therefore what focus must return to, and the
  // two boxes are the same rectangle anyway.
  const openNodePopoverAt = useCallback(
    (id: string, anchor: HTMLElement, viaKeyboard: boolean) => {
      const live = nodesRef.current.find((n) => n.id === id);
      if (live && isClaimNode(live)) setPopoverNode({ node: live, anchor, viaKeyboard });
    },
    []
  );

  // Closing them, with the focus bookkeeping Escape needs. Returns true when it
  // moved focus, so the caller does not then move it somewhere else.
  const dismissPopovers = useCallback(
    (restoreFocus: boolean): boolean => {
      const origin = popoverNode?.viaKeyboard
        ? popoverNode.anchor
        : popoverEdge?.origin;
      setPopoverNode(null);
      setPopoverEdge(null);
      if (!restoreFocus || !origin || !origin.isConnected) return false;
      origin.focus();
      return true;
    },
    [popoverNode, popoverEdge]
  );

  // A modifier click is React Flow's multi-select gesture. Let it through
  // untouched rather than opening a popover over the selection being built —
  // and without preventDefault or stopPropagation, which swallow the event
  // before selection runs. This prop must also stay present whatever it does:
  // @xyflow/react v12 only wires React's click event for nodes when it is
  // given, and without it clicks on interactive children inside a custom node
  // (the DomainGroupNode header button, even with `nodrag nopan`) are silently
  // dropped. Removing it re-introduces the regression bisected on 2026-05-20.
  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: GraphNode) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (!isClaimNode(node)) return;
      openNodePopoverAt(node.id, e.currentTarget as HTMLElement, false);
    },
    [openNodePopoverAt]
  );

  // The neighbourhood highlight. Group nodes are excluded because no edge ever
  // names one, so `isNeighbor` answers false for every claim and hovering a
  // group would dim the whole canvas.
  const onNodeMouseEnter = useCallback((_e: React.MouseEvent, node: GraphNode) => {
    if (isClaimNode(node)) setFocusId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => setFocusId(null), []);

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
      proposeEdge({
        source: c.source,
        target: c.target,
        sourceHandle: norm(c.sourceHandle),
        targetHandle: norm(c.targetHandle),
        kind,
      });
    },
    [proposeEdge]
  );

  // Persist + history on node-position-change-end (after drag). Inline rather
  // than deferred: the drag is already over, so the refs are current.
  const onNodeDragStop = useCallback(() => commit(), [commit]);

  // Backspace/Delete on selected elements — React Flow handles the deletion
  // via deleteKeyCode; we drop the orphaned edges and record it.
  const onNodesDelete = useCallback(
    (deleted: GraphNode[]) => {
      const ids = new Set(deleted.filter(isClaimNode).map((n) => n.id));
      if (ids.size === 0) return;
      setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
      commitNextFrame();
    },
    [setEdges, commitNextFrame]
  );
  const onEdgesDelete = useCallback(() => commitNextFrame(), [commitNextFrame]);

  const availableDomains = useMemo(() => {
    const out = new Set<string>();
    for (const n of nodes) {
      if (isGroupNode(n)) out.add(n.data.domain);
      else if (isClaimNode(n) && n.data.domain) out.add(n.data.domain);
    }
    return Array.from(out).sort();
  }, [nodes]);

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
      openEdgePopover: (e, anchor, ev) =>
        setPopoverEdge({ edge: e, anchor, cursor: ev }),
      scheduleCloseEdgePopover,
      cancelCloseEdgePopover,
      openNodeEditor,
      openEdgeEditor: (e) => {
        // An existing edge carries `data`; anything else is a proposal for an
        // edge that does not exist yet.
        if ("data" in e && e.data) openEdgeEditor(e as ClaimEdge);
        else proposeEdge(e as { source: string; target: string; kind: EngineEdge["kind"] });
      },
      isNeighbor,
      toggleDomainCollapse,
    }),
    [
      editable,
      mode,
      focusId,
      isNeighbor,
      openNodeEditor,
      openEdgeEditor,
      proposeEdge,
      scheduleCloseEdgePopover,
      cancelCloseEdgePopover,
      toggleDomainCollapse,
    ]
  );

  // Refit on resize, debounced: a drag-resize delivers events per frame, and
  // fitView is a full measure + zoom pass. Trailing-edge only, so the refit
  // runs once on the settled size. setTimeout, not rAF — an automated
  // (hidden) tab never fires rAF, and this must not add another path that
  // silently does nothing there (see CLAUDE.md's browser-pass caveat).
  useLayoutEffect(() => {
    let t: number | undefined;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(
        () => rf.fitView({ padding: mode === "inline" ? 0.05 : 0.15 }),
        150
      );
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [rf, mode]);

  /**
   * Keyboard and focus navigation for the canvas: one listener on the root
   * rather than handlers on the node and edge components.
   *
   * React Flow's own wrappers are the focusable elements, and a keydown does
   * not reach a child from a focused parent, so a handler beside the old click
   * handler in `ClaimNode` would never have fired. Its wrapper also already
   * carries React Flow's `onKeyDown` (Enter and Space select, arrows move a
   * selected node, Escape unselects), and `node.domAttributes` is spread after
   * the built-ins, so supplying one there replaces that handler and takes
   * arrow-key movement with it. Listening on an ancestor runs after React
   * Flow's and adds to it. See knowledge/issues.md (2026-08-21).
   *
   * Native listeners rather than JSX props because this div is not itself an
   * interactive element and should not claim to be; the events it handles
   * belong to the nodes and edges inside it.
   */
  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;

    // Focus mirrors hover: on a node it lights the neighbourhood, on an edge it
    // opens the rationale. That parity is the whole model, and it is why
    // neither is bound in the components any more.
    const onFocusIn = (e: FocusEvent) => {
      if (editorOpenRef.current) return;
      const t = resolveCanvasTarget(e.target);
      if (!t) return;
      if (t.kind === "node") {
        const node = nodesRef.current.find((n) => n.id === t.id);
        if (node && isClaimNode(node)) setFocusId(t.id);
        return;
      }
      const edge = edgesRef.current.find((x) => x.id === t.id);
      if (!edge || !edgeHasPopover(edge)) return;
      cancelCloseEdgePopover();
      setPopoverEdge({
        edge,
        anchor: edgeAnchorElement(root, t.id, t.el),
        origin: t.el as HTMLElement | SVGElement,
      });
    };

    const onFocusOut = (e: FocusEvent) => {
      const t = resolveCanvasTarget(e.target);
      if (!t || !focusLeft(t.el, e.relatedTarget)) return;
      if (t.kind === "node") setFocusId(null);
      else scheduleCloseEdgePopover();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // An open editor owns the keyboard, Escape included.
      if (editorOpenRef.current) return;

      if (e.key === "Escape") {
        // Escape from inside a popover returns focus to what opened it. From
        // the node or edge itself focus never moved, so there is nothing to
        // restore and React Flow's own Escape (unselect) still applies.
        dismissPopovers(resolveCanvasTarget(e.target) === null);
        return;
      }
      if (e.key !== "Enter") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // The browser is about to activate a button or a link of its own.
      if (isNativeActivationTarget(e.target)) return;

      const t = resolveCanvasTarget(e.target);
      if (!t) return;
      if (t.kind === "node") {
        e.preventDefault();
        openNodePopoverAt(t.id, t.el, true);
        return;
      }
      const edge = edgesRef.current.find((x) => x.id === t.id);
      if (!edge) return;
      e.preventDefault();
      if (editableRef.current) {
        openEdgeEditor(edge);
        return;
      }
      // Read-only: the popover is already open from the focus, and Enter is
      // what moves into it. Its source links are otherwise unreachable, since
      // it renders after every node and edge on the canvas.
      root.querySelector<HTMLElement>(".ag-edge-popover")?.focus();
    };

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [
    cancelCloseEdgePopover,
    scheduleCloseEdgePopover,
    dismissPopovers,
    openNodePopoverAt,
    openEdgeEditor,
  ]);

  // Names for the two focusable wrappers, applied on the way into React Flow
  // rather than baked into the state: `nodesRef` is what the exporter and the
  // persisted sandbox read, and neither wants a label in it.
  const a11yNodes = useMemo(() => withNodeAriaLabels(nodes), [nodes]);
  const a11yEdges = useMemo(() => withEdgeAriaLabels(edges), [edges]);
  const ariaLabelConfig = useMemo(() => canvasAriaLabels(editable), [editable]);

  const isInline = mode === "inline";

  return (
    <div ref={wrapperRef} className={`ag-rf-root ag-rf-${mode}`}>
      <EdgeMarkerDefs />

      <GraphContext.Provider value={ctx}>
        <ReactFlow<GraphNode, ClaimEdge>
          nodes={a11yNodes}
          edges={a11yEdges}
          ariaLabelConfig={ariaLabelConfig}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={editable ? onConnect : undefined}
          onNodeDragStop={editable ? onNodeDragStop : undefined}
          onNodesDelete={editable ? onNodesDelete : undefined}
          onEdgesDelete={editable ? onEdgesDelete : undefined}
          onMoveEnd={onMoveEnd}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
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
              <span><kbd>⇥</kbd> then <kbd>↵</kbd> open</span>
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
            takeFocus={popoverNode.viaKeyboard}
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
          onClose={closeNodeEditor}
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
          onClose={closeEdgeEditor}
        />
      )}
    </div>
  );
}
