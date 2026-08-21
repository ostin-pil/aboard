// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  edgeAnchorElement,
  focusLeft,
  isNativeActivationTarget,
  resolveCanvasTarget,
} from "./canvas-keys";

/**
 * The canvas listens on its root and works out which node or edge an event
 * belongs to from the DOM. Every one of these cases is a real shape React Flow
 * emits, and the interesting ones are the two that do not follow from
 * "call closest": the edge label, which `EdgeLabelRenderer` portals out of the
 * edge's own `<g>` so no ancestor walk from it ever reaches the edge, and the
 * buttons inside a node, which sit under a wrapper the walk *would* attribute
 * to the node.
 *
 * The markup is hand-written rather than rendered, because what is being tested
 * is a selector against React Flow's DOM contract (`.react-flow__node[data-id]`,
 * `.react-flow__edge[data-id]`), and rendering the real canvas in jsdom needs a
 * store, a ResizeObserver and a viewport it has no way to measure.
 */

const ROOT_HTML = `
  <div class="ag-rf-root">
    <div class="react-flow">
      <div class="react-flow__node react-flow__node-claim" data-id="S1" tabindex="0">
        <div class="ag-node" data-id="S1">
          <div class="ag-node-title">a symptom</div>
          <button class="ag-node-edit-btn" aria-label="Edit claim">edit</button>
        </div>
      </div>
      <div class="react-flow__node react-flow__node-domainGroup" data-id="__domain_inequality">
        <div class="ag-domain-group"><button class="ag-domain-group-toggle">x</button></div>
      </div>
      <svg>
        <g class="react-flow__edge" data-id="S1-&gt;M1#causes#0" tabindex="0">
          <path class="react-flow__edge-path" d="M0,0 L10,10"></path>
        </g>
      </svg>
      <div class="react-flow__edgelabel-renderer">
        <button class="ag-edge-label" data-edge-id="S1-&gt;M1#causes#0">causes</button>
      </div>
    </div>
    <div class="ag-edge-popover"><a href="https://example.org">a source</a></div>
  </div>
`;

const EDGE_ID = "S1->M1#causes#0";

let root: HTMLElement;
const pick = (selector: string): Element => {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`fixture is missing ${selector}`);
  return el;
};

beforeEach(() => {
  document.body.innerHTML = ROOT_HTML;
  root = document.body.firstElementChild as HTMLElement;
});

describe("resolveCanvasTarget", () => {
  it("finds the node from anything inside the card it wraps", () => {
    expect(resolveCanvasTarget(pick(".ag-node-title"))).toMatchObject({
      kind: "node",
      id: "S1",
    });
  });

  it("resolves to the wrapper, which is the element that holds the tab stop", () => {
    const t = resolveCanvasTarget(pick(".ag-node-title"));
    expect(t?.el).toBe(pick(".react-flow__node[data-id='S1']"));
  });

  it("finds a group node too, so the canvas can decline it rather than miss it", () => {
    expect(resolveCanvasTarget(pick(".ag-domain-group-toggle"))).toMatchObject({
      kind: "node",
      id: "__domain_inequality",
    });
  });

  it("finds the edge from its path", () => {
    expect(resolveCanvasTarget(pick(".react-flow__edge-path"))).toMatchObject({
      kind: "edge",
      id: EDGE_ID,
    });
  });

  /**
   * The case the ancestor walk cannot reach: the label is a sibling of the
   * whole edge layer, so `closest('.react-flow__edge')` from it returns null.
   * Without the `data-edge-id` branch, focusing or keying the label resolves to
   * nothing and the edge silently has no keyboard behaviour.
   */
  it("finds the edge from its label, which renders outside the edge's <g>", () => {
    const label = pick(".ag-edge-label");
    expect(label.closest(".react-flow__edge")).toBeNull();
    expect(resolveCanvasTarget(label)).toMatchObject({ kind: "edge", id: EDGE_ID });
  });

  it("answers null for the canvas chrome and for a non-element target", () => {
    expect(resolveCanvasTarget(pick(".ag-edge-popover"))).toBeNull();
    expect(resolveCanvasTarget(root)).toBeNull();
    expect(resolveCanvasTarget(null)).toBeNull();
  });
});

describe("edgeAnchorElement", () => {
  it("prefers the label chip over the bezier's bounding box", () => {
    const g = pick(".react-flow__edge");
    expect(edgeAnchorElement(root, EDGE_ID, g)).toBe(pick(".ag-edge-label"));
  });

  /**
   * The id is interpolated into a quoted attribute selector. React Flow's edge
   * ids carry `>` and `#`, both of which are syntax errors unescaped, so this
   * would throw rather than merely miss if the quoting were dropped.
   */
  it("survives the punctuation React Flow puts in an edge id", () => {
    expect(() => edgeAnchorElement(root, EDGE_ID, pick(".react-flow__edge"))).not.toThrow();
  });

  it("falls back to the edge itself in inline mode, where no label renders", () => {
    pick(".ag-edge-label").remove();
    const g = pick(".react-flow__edge");
    expect(edgeAnchorElement(root, EDGE_ID, g)).toBe(g);
  });
});

describe("focusLeft", () => {
  it("is false when focus moves within the same node", () => {
    const node = pick(".react-flow__node[data-id='S1']");
    expect(focusLeft(node, pick(".ag-node-edit-btn"))).toBe(false);
  });

  it("is true when focus moves to another node, or out of the document", () => {
    const node = pick(".react-flow__node[data-id='S1']");
    expect(focusLeft(node, pick(".react-flow__edge"))).toBe(true);
    expect(focusLeft(node, null)).toBe(true);
  });
});

describe("isNativeActivationTarget", () => {
  it("claims the controls the browser will activate on Enter itself", () => {
    expect(isNativeActivationTarget(pick(".ag-node-edit-btn"))).toBe(true);
    expect(isNativeActivationTarget(pick(".ag-edge-label"))).toBe(true);
    expect(isNativeActivationTarget(pick(".ag-edge-popover a"))).toBe(true);
  });

  it("leaves the node and edge wrappers to the canvas", () => {
    expect(isNativeActivationTarget(pick(".ag-node-title"))).toBe(false);
    expect(isNativeActivationTarget(pick(".react-flow__edge-path"))).toBe(false);
    expect(isNativeActivationTarget(null)).toBe(false);
  });
});
