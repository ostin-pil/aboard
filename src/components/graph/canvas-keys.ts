/**
 * Resolving a DOM event on the canvas back to the node or edge it belongs to.
 *
 * The canvas listens for keyboard and focus events on its root rather than on
 * the node and edge components, and this is the lookup that makes that
 * possible. Two facts force the arrangement:
 *
 * - The tab stop is React Flow's wrapper, not the div a custom node renders,
 *   and a keydown does not reach a child from a focused parent. A handler
 *   beside the click handler in `ClaimNode` would never fire.
 * - The wrapper already carries React Flow's own `onKeyDown` (Enter and Space
 *   select, arrows move a selected node, Escape unselects). `node.domAttributes`
 *   is spread after the built-ins, so supplying an `onKeyDown` there replaces
 *   that handler and takes arrow-key movement with it.
 *
 * A listener on an ancestor runs after React Flow's, adds to it, and replaces
 * nothing. See knowledge/issues.md (2026-08-21).
 */

export type CanvasTarget =
  | { kind: "node"; id: string; el: HTMLElement }
  | { kind: "edge"; id: string; el: Element };

/**
 * React Flow writes `data-id` on both wrappers, which is the only identifier
 * available from the DOM side of the event.
 *
 * The edge *label* is checked first and separately: it renders through
 * `EdgeLabelRenderer`, which portals it into a sibling container rather than
 * into the edge's own `<g>`, so `closest` from the label never reaches the
 * edge. Its `data-edge-id` is what puts it back.
 */
export function resolveCanvasTarget(target: EventTarget | null): CanvasTarget | null {
  if (!(target instanceof Element)) return null;

  const label = target.closest<HTMLElement>(".ag-edge-label[data-edge-id]");
  if (label) {
    const id = label.getAttribute("data-edge-id");
    return id ? { kind: "edge", id, el: label } : null;
  }

  const node = target.closest<HTMLElement>(".react-flow__node[data-id]");
  if (node) {
    const id = node.getAttribute("data-id");
    return id ? { kind: "node", id, el: node } : null;
  }

  const edge = target.closest(".react-flow__edge[data-id]");
  if (edge) {
    const id = edge.getAttribute("data-id");
    return id ? { kind: "edge", id, el: edge } : null;
  }

  return null;
}

/**
 * Where an edge's popover should point. The label is a small, visible chip and
 * the `<g>` is a bezier whose bounding box can be most of the viewport, so the
 * label is much the better anchor when the edge has one — it only renders in
 * fullbleed mode, which is why there is a fallback at all.
 *
 * The id is interpolated into a quoted attribute selector rather than escaped:
 * React Flow edge ids are `<from>-><to>#<kind>#<i>`, which contains `>` and `#`
 * (both illegal unescaped in a selector) but never a quote.
 */
export function edgeAnchorElement(
  root: ParentNode,
  edgeId: string,
  fallback: Element
): HTMLElement | SVGElement {
  const label = root.querySelector<HTMLElement>(
    `.ag-edge-label[data-edge-id="${edgeId}"]`
  );
  if (label) return label;
  return fallback as SVGElement;
}

/**
 * True when focus has left `el` for somewhere outside it. A focusout inside the
 * same node (its body to its edit button) is not a blur of the node, and
 * treating it as one drops the neighbourhood highlight mid-tab.
 */
export function focusLeft(el: Element, relatedTarget: EventTarget | null): boolean {
  if (!(relatedTarget instanceof Element)) return true;
  return !el.contains(relatedTarget);
}

/**
 * True when the browser will act on Enter itself: a button, a link, a form
 * control. The canvas has several inside its nodes (the edit affordance, a
 * group's chevron, the edge label), and each sits inside the wrapper that
 * `resolveCanvasTarget` would happily attribute to the node or edge around it.
 * Without this, Enter on a node's edit button opens the editor and the detail
 * popover at once.
 */
export function isNativeActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("button, a[href], input, select, textarea, [contenteditable]");
}
