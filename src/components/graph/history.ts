import type { ClaimEdge, GraphNode } from "./types";

/**
 * The undo/redo stack, as data.
 *
 * Every entry is a copy taken at push time and copied again on the way out,
 * which is the property the whole thing rests on: React Flow mutates the node
 * objects it is handed (measured dimensions, selection, drag state), so a stack
 * holding live references would see its history rewritten underneath it and
 * "undo" would restore the present.
 */

export type GraphSnapshot = { nodes: GraphNode[]; edges: ClaimEdge[] };
export type History = { stack: GraphSnapshot[]; idx: number };

/** Entries kept before the oldest is dropped. */
export const HISTORY_LIMIT = 60;

/**
 * One level deep: the node and edge objects and their `data`. Deeper is not
 * needed (positions are replaced wholesale, never mutated in place) and a
 * structured clone of the whole graph on every edit is not free.
 */
export function copySnapshot(snap: GraphSnapshot): GraphSnapshot {
  return {
    nodes: snap.nodes.map((n) => ({ ...n, data: { ...n.data } }) as GraphNode),
    edges: snap.edges.map((e) => ({ ...e, data: { ...e.data! } })),
  };
}

export function createHistory(snap: GraphSnapshot): History {
  return { stack: [snap], idx: 0 };
}

/**
 * Record a new state. Anything ahead of the cursor is dropped: editing after
 * an undo forks the timeline, and the abandoned branch is not reachable.
 */
export function pushSnapshot(
  history: History,
  snap: GraphSnapshot,
  limit: number = HISTORY_LIMIT
): History {
  const stack = [...history.stack.slice(0, history.idx + 1), copySnapshot(snap)];
  if (stack.length > limit) stack.shift();
  return { stack, idx: stack.length - 1 };
}

/** The previous state, or null at the oldest entry. */
export function stepBack(
  history: History
): { history: History; entry: GraphSnapshot } | null {
  if (history.idx <= 0) return null;
  const idx = history.idx - 1;
  return { history: { ...history, idx }, entry: copySnapshot(history.stack[idx]) };
}

/** The next state, or null at the newest entry. */
export function stepForward(
  history: History
): { history: History; entry: GraphSnapshot } | null {
  if (history.idx >= history.stack.length - 1) return null;
  const idx = history.idx + 1;
  return { history: { ...history, idx }, entry: copySnapshot(history.stack[idx]) };
}
