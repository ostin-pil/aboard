import type { ClaimEdge, ClaimNode, GraphNode } from "./types";
import { canonicalEndpoints, edgeHasPopover, isClaimNode } from "./types";

/**
 * Accessible names for the canvas, and the descriptions that tell a keyboard
 * user what the canvas does.
 *
 * These live on the React Flow node and edge objects rather than in the node
 * and edge components, because the focusable element is React Flow's own
 * wrapper (`nodesFocusable` / `edgesFocusable`, both on by default) and nothing
 * a custom component renders can name the element that holds the tab stop.
 * `ariaLabel` on the object is the supported route to it.
 *
 * Unnamed, the wrappers are not silent — they are worse than silent. A node
 * announces as "group" plus whatever its inner text happens to be, which for a
 * claim is the kind, the id, `c=0.72` and the title run together; an edge takes
 * React Flow's fallback "Edge from S1 to M1", which names the endpoints and not
 * the relation, so `causes` and `reduces` are indistinguishable.
 */

const KIND_WORD: Record<EngineNode["kind"], string> = {
  symptom: "symptom",
  mechanism: "mechanism",
  leverage: "leverage point",
};

/**
 * A claim node's name: what it is, what it says, and the three badges the card
 * renders as glyphs. Confidence is read as a number rather than as `c=0.72`,
 * which a screen reader spells out one character at a time.
 */
export function nodeAriaLabel(node: ClaimNode): string {
  const d = node.data;
  const parts = [
    `${KIND_WORD[d.kind]} ${node.id}: ${d.title}`,
    `confidence ${d.conf.toFixed(2)}`,
  ];
  if (d.forecast > 0) {
    parts.push(`${d.forecast} forecast${d.forecast === 1 ? "" : "s"}`);
  }
  if (d.dossier) parts.push("has a dossier");
  if (d.author === "agent:reader/v0") parts.push("unsigned sandbox claim");
  if (d.outOfDomain) parts.push("outside the active domain");
  return `${parts.join(", ")}.`;
}

/**
 * An edge's name reads as the relation it asserts. Endpoints are the canonical
 * ones, so an edge re-pointed at a collapsed group's pill still announces the
 * claims it actually joins rather than `__domain_inequality`.
 */
export function edgeAriaLabel(edge: ClaimEdge): string {
  const { source, target } = canonicalEndpoints(edge);
  const parts = [`${source} ${edge.data?.kind ?? "causes"} ${target}`];
  if (edge.data?.crossDomain) parts.push("cross-domain");
  if (edgeHasPopover(edge)) parts.push("has a rationale");
  if (edge.data?.outOfDomain) parts.push("outside the active domain");
  return `${parts.join(", ")}.`;
}

/**
 * Applied to the arrays on their way into React Flow rather than baked in at
 * `engineToRF`, so a name cannot go stale behind an edit: the node editor, the
 * bulk actions and the domain filter all rewrite node data, and only one of
 * them would have thought to rewrite a label too. It also keeps the labels out
 * of `nodesRef`, which is what the exporter and the persisted sandbox read.
 */
export function withNodeAriaLabels(nodes: GraphNode[]): GraphNode[] {
  return nodes.map((n) =>
    isClaimNode(n) ? { ...n, ariaLabel: nodeAriaLabel(n) } : n
  );
}

export function withEdgeAriaLabels(edges: ClaimEdge[]): ClaimEdge[] {
  return edges.map((e) => ({ ...e, ariaLabel: edgeAriaLabel(e) }));
}

/**
 * The `aria-describedby` text React Flow attaches to every node and edge. Its
 * defaults describe React Flow's own model ("press enter or space to select a
 * node"), which is true here but is not the interesting half: Enter also opens
 * the claim, and on a read-only canvas selection does nothing at all.
 *
 * Both node keys are overridden because React Flow picks between them on
 * `disableKeyboardA11y`, and the one it uses when keyboard support is *on* is
 * the one named `keyboardDisabled`.
 */
export function canvasAriaLabels(editable: boolean): {
  "node.a11yDescription.default": string;
  "node.a11yDescription.keyboardDisabled": string;
  "edge.a11yDescription.default": string;
} {
  const node = editable
    ? "Press Enter to open this claim's details, then Escape to close them and return here. Press Space to select the node: arrow keys then move it and Delete removes it."
    : "Press Enter to open this claim's details, then Escape to close them and return here.";
  // No Escape here, deliberately, and it is the one line the browser pass
  // rewrote. An edge's rationale follows focus the way it follows hover, so
  // Escape closes it and the focus still sitting on the edge re-opens it in the
  // same frame. Moving focus away is what dismisses it; saying otherwise would
  // describe a keystroke that visibly does nothing.
  const edge = editable
    ? "Focusing an edge shows its rationale. Press Enter to edit the relation."
    : "Focusing an edge shows its rationale. Press Enter to move into it and reach its sources, then Escape to come back.";
  return {
    "node.a11yDescription.default": node,
    "node.a11yDescription.keyboardDisabled": node,
    "edge.a11yDescription.default": edge,
  };
}
