import { useCallback, useRef, type RefObject } from "react";
import { recomputeGroupBounds, type LayoutMode } from "./engine-to-rf";
import {
  copySnapshot,
  createHistory,
  pushSnapshot,
  stepBack,
  stepForward,
  type GraphSnapshot,
} from "./history";
import { isGroupNode, type ClaimEdge, type GraphNode } from "./types";

type Options = {
  initial: GraphSnapshot;
  nodesRef: RefObject<GraphNode[]>;
  edgesRef: RefObject<ClaimEdge[]>;
  setNodes: (updater: GraphNode[] | ((ns: GraphNode[]) => GraphNode[])) => void;
  setEdges: (updater: ClaimEdge[] | ((es: ClaimEdge[]) => ClaimEdge[])) => void;
  mode: LayoutMode;
  updateNodeInternals: (id: string) => void;
  persist: () => void;
};

export type GraphHistory = {
  /** Record the committed graph as a new undo step. */
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  /** Forget everything and start again from `snap`. Used by instance.reset. */
  resetHistory: (snap: GraphSnapshot) => void;
};

/**
 * Undo/redo over the canvas, binding the pure stack in `history.ts` to React
 * Flow's state setters.
 *
 * What is React-specific here, and is why the stack alone is not enough: a
 * restore has to replay the post-processing the live collapse path does.
 * Undo/redo set a group's `style.width`/`height` directly, and React Flow does
 * not re-measure on its own, so its cached `measured` dims go stale, the
 * collapsed pill becomes undraggable and its expand chevron unhittable. That is
 * the same wedge `toggleDomainCollapse` guards against. So after restoring:
 * recompute bounds for expanded groups (collapsed ones are skipped inside
 * `recomputeGroupBounds`), then force a re-measure of every group.
 */
export function useGraphHistory({
  initial,
  nodesRef,
  edgesRef,
  setNodes,
  setEdges,
  mode,
  updateNodeInternals,
  persist,
}: Options): GraphHistory {
  // Copied on the way in for the same reason entries are copied on the way out:
  // the seed arrays are handed to React Flow as well, which mutates the node
  // objects it renders, so storing them by reference would let the present
  // rewrite the oldest undo step.
  const historyRef = useRef(createHistory(copySnapshot(initial)));

  const snapshot = useCallback(() => {
    historyRef.current = pushSnapshot(historyRef.current, {
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
  }, [nodesRef, edgesRef]);

  const restore = useCallback(
    (snap: GraphSnapshot) => {
      const groupIds = snap.nodes.filter(isGroupNode).map((g) => g.id);
      setNodes(groupIds.length ? recomputeGroupBounds(snap.nodes, mode) : snap.nodes);
      setEdges(snap.edges);
      requestAnimationFrame(() => {
        groupIds.forEach((id) => updateNodeInternals(id));
        persist();
      });
    },
    [setNodes, setEdges, mode, updateNodeInternals, persist]
  );

  const undo = useCallback(() => {
    const step = stepBack(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    restore(step.entry);
  }, [restore]);

  const redo = useCallback(() => {
    const step = stepForward(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    restore(step.entry);
  }, [restore]);

  const resetHistory = useCallback((snap: GraphSnapshot) => {
    historyRef.current = createHistory(copySnapshot(snap));
  }, []);

  return { snapshot, undo, redo, resetHistory };
}
