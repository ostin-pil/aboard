import { useCallback, useState, type RefObject } from "react";
import { expandGroupEdges, type LayoutMode } from "./engine-to-rf";
import { resolveExpandTarget, saveClaimNode } from "./graph-ops";
import { mintClaimId } from "./mint-id";
import { isClaimNode, type ClaimEdge, type ClaimNode, type GraphNode } from "./types";

/** A new or existing edge being described in the edge editor. */
export type EdgeDraft = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  kind: EngineEdge["kind"];
  isNew: boolean;
};

type Options = {
  mode: LayoutMode;
  nodesRef: RefObject<GraphNode[]>;
  setNodes: (updater: GraphNode[] | ((ns: GraphNode[]) => GraphNode[])) => void;
  setEdges: (updater: ClaimEdge[] | ((es: ClaimEdge[]) => ClaimEdge[])) => void;
  /**
   * Record the mutation just made, on the next frame. The optional argument
   * names a group whose box changed size and has to be re-measured.
   */
  commitNextFrame: (remeasureGroup?: string) => void;
};

/**
 * The two editor modals: which one is open, on what, and what saving or
 * deleting does to the graph.
 *
 * The state lives here rather than in the canvas because the canvas only needs
 * two facts about it — whether a modal is open (the keyboard guard) and which
 * to render. Everything else is this cluster's business.
 */
export function useGraphEditing({
  mode,
  nodesRef,
  setNodes,
  setEdges,
  commitNextFrame,
}: Options) {
  const [editingNode, setEditingNode] = useState<{ node: ClaimNode | null } | null>(null);
  const [editingEdge, setEditingEdge] = useState<EdgeDraft | null>(null);

  /** `null` opens the editor on a new claim. */
  const openNodeEditor = useCallback(
    (id: string | null) => {
      if (id === null) {
        setEditingNode({ node: null });
        return;
      }
      const live = nodesRef.current.find((n) => n.id === id);
      if (live && isClaimNode(live)) setEditingNode({ node: live });
    },
    [nodesRef]
  );

  const openEdgeEditor = useCallback((edge: ClaimEdge) => {
    setEditingEdge({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.data?.kind ?? "causes",
      isNew: false,
    });
  }, []);

  /** An edge that does not exist yet: a fresh connection, or a proposal. */
  const proposeEdge = useCallback((draft: Omit<EdgeDraft, "isNew" | "id">) => {
    setEditingEdge({ ...draft, isNew: true });
  }, []);

  const closeNodeEditor = useCallback(() => setEditingNode(null), []);
  const closeEdgeEditor = useCallback(() => setEditingEdge(null), []);

  /** Domain-aware: the minted id carries the target domain's prefix. */
  const newId = useCallback(
    (kind: EngineNode["kind"], domain?: string) => {
      const claims = nodesRef.current
        .filter(isClaimNode)
        .map((n) => ({ id: n.id, domain: n.data.domain }));
      return mintClaimId(kind, domain, claims);
    },
    [nodesRef]
  );

  const existingRowsCount = useCallback(
    (row: 1 | 2 | 3) =>
      nodesRef.current.filter(
        (n): n is ClaimNode => isClaimNode(n) && n.data.row === row
      ).length,
    [nodesRef]
  );

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
      // The re-measure argument is the same one the chevron path needs: the
      // group's style.width and height just changed and React Flow does not
      // notice on its own, so its cached dims stay at the collapsed pill's and
      // the group is undraggable.
      commitNextFrame(expandTarget?.groupId);
    },
    [mode, nodesRef, setNodes, setEdges, commitNextFrame]
  );

  const onNodeDelete = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setEditingNode(null);
      commitNextFrame();
    },
    [setNodes, setEdges, commitNextFrame]
  );

  const onEdgeSave = useCallback(
    (kind: EngineEdge["kind"]) => {
      if (!editingEdge) return;
      if (editingEdge.isNew) {
        setEdges((es) => [
          ...es,
          {
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
          },
        ]);
      } else {
        setEdges((es) =>
          es.map((e) => (e.id === editingEdge.id ? { ...e, data: { ...e.data!, kind } } : e))
        );
      }
      setEditingEdge(null);
      commitNextFrame();
    },
    [editingEdge, setEdges, commitNextFrame]
  );

  const onEdgeDelete = useCallback(() => {
    // A proposed edge that was never saved has no id and nothing to delete;
    // closing the editor is the whole operation.
    if (!editingEdge?.id) {
      setEditingEdge(null);
      return;
    }
    const { id } = editingEdge;
    setEdges((es) => es.filter((e) => e.id !== id));
    setEditingEdge(null);
    commitNextFrame();
  }, [editingEdge, setEdges, commitNextFrame]);

  return {
    editingNode,
    editingEdge,
    isEditorOpen: editingNode !== null || editingEdge !== null,
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
  };
}
