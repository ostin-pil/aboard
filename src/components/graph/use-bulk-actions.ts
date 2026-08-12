import { useCallback, useMemo } from "react";
import { alignColumn, distributeX, type XBox } from "./align";
import { type LayoutMode } from "./engine-to-rf";
import { applyXPositions, groupClaimsInto, moveClaimsToRow } from "./graph-ops";
import { isClaimNode, type ClaimNode, type GraphNode } from "./types";

type Options = {
  nodes: GraphNode[];
  mode: LayoutMode;
  setNodes: (updater: GraphNode[] | ((ns: GraphNode[]) => GraphNode[])) => void;
  /** Delegated to React Flow so deletion runs its own onNodesDelete path. */
  deleteNodes: (ids: string[]) => void;
  commitNextFrame: () => void;
};

/**
 * What the multi-select toolbar does. Every action here operates on the
 * current selection and nothing else, which is why the selection is derived
 * here rather than passed in.
 */
export function useBulkActions({
  nodes,
  mode,
  setNodes,
  deleteNodes,
  commitNextFrame,
}: Options) {
  const selectedClaimIds = useMemo(
    () => nodes.filter((n): n is ClaimNode => isClaimNode(n) && !!n.selected).map((n) => n.id),
    [nodes]
  );

  const bulkDelete = useCallback(() => {
    if (selectedClaimIds.length === 0) return;
    deleteNodes(selectedClaimIds);
  }, [deleteNodes, selectedClaimIds]);

  const bulkClearSelection = useCallback(() => {
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
  }, [setNodes]);

  const bulkGroupInto = useCallback(
    (domainName: string) => {
      if (selectedClaimIds.length === 0) return;
      const selected = new Set(selectedClaimIds);
      setNodes((ns) => groupClaimsInto(ns, selected, domainName, mode));
      commitNextFrame();
    },
    [selectedClaimIds, mode, setNodes, commitNextFrame]
  );

  const bulkMoveToRow = useCallback(
    (targetRow: 1 | 2 | 3) => {
      if (selectedClaimIds.length < 1) return;
      const selected = new Set(selectedClaimIds);
      setNodes((ns) => moveClaimsToRow(ns, selected, targetRow, mode));
      commitNextFrame();
    },
    [selectedClaimIds, mode, setNodes, commitNextFrame]
  );

  // Both align actions need two boxes to mean anything, which is also the
  // threshold at which the toolbar appears.
  const applyX = useCallback(
    (compute: (boxes: XBox[]) => Map<string, number>) => {
      if (selectedClaimIds.length < 2) return;
      const selected = new Set(selectedClaimIds);
      setNodes((ns) => applyXPositions(ns, selected, compute, mode));
      commitNextFrame();
    },
    [selectedClaimIds, mode, setNodes, commitNextFrame]
  );

  const bulkAlignColumn = useCallback(() => applyX(alignColumn), [applyX]);
  const bulkDistributeX = useCallback(() => applyX(distributeX), [applyX]);

  return {
    selectedClaimIds,
    bulkDelete,
    bulkClearSelection,
    bulkGroupInto,
    bulkMoveToRow,
    bulkAlignColumn,
    bulkDistributeX,
  };
}
