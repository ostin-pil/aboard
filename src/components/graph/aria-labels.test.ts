import { describe, expect, it } from "vitest";
import {
  canvasAriaLabels,
  edgeAriaLabel,
  nodeAriaLabel,
  withEdgeAriaLabels,
  withNodeAriaLabels,
} from "./aria-labels";
import type { ClaimEdge, ClaimNode, GraphNode } from "./types";

/**
 * The names on the canvas's tab stops. Nothing else in the gate can see these:
 * a wrong or missing `ariaLabel` is a well-typed string on a well-typed object,
 * and the only symptom is that a screen reader reads the wrong thing.
 *
 * What the tests pin is what a listener would notice. That the kind is a word
 * rather than a CSS class, that confidence is a number rather than `c=0.72`
 * spelled out a character at a time, that an edge says which relation it
 * asserts instead of React Flow's endpoints-only fallback, and that an edge
 * re-pointed at a collapsed group still names the claims it joins.
 */

type ClaimOverrides = Omit<Partial<ClaimNode>, "data"> & {
  data?: Partial<ClaimNode["data"]>;
};

function claim(id: string, over: ClaimOverrides = {}): ClaimNode {
  const { data, ...rest } = over;
  return {
    id,
    type: "claim",
    position: { x: 0, y: 0 },
    data: {
      kind: "symptom",
      title: `${id} title`,
      body: "",
      meta: "",
      conf: 0.72,
      author: "",
      filed: "",
      row: 1,
      col: 0,
      dossier: false,
      forecast: 0,
      domain: undefined,
      outOfDomain: false,
      ...data,
    },
    ...rest,
  } as unknown as ClaimNode;
}

const group = (domain: string): GraphNode =>
  ({
    id: `__domain_${domain}`,
    type: "domainGroup",
    position: { x: 0, y: 0 },
    data: { domain, claimCount: 2, collapsed: false },
  }) as unknown as GraphNode;

const edge = (source: string, target: string, over: Partial<ClaimEdge> = {}): ClaimEdge =>
  ({
    id: `${source}->${target}#causes#0`,
    type: "claim",
    source,
    target,
    data: {
      kind: "causes",
      rationale: "",
      sources: [],
      crossDomain: false,
      outOfDomain: false,
    },
    ...over,
  }) as unknown as ClaimEdge;

describe("nodeAriaLabel", () => {
  it("names the kind in words, then the claim, then its confidence", () => {
    expect(nodeAriaLabel(claim("S1"))).toBe("symptom S1: S1 title, confidence 0.72.");
  });

  it("spells out the kind React Flow's markup only encodes as a data attribute", () => {
    expect(nodeAriaLabel(claim("L1", { data: { kind: "leverage" } }))).toContain(
      "leverage point L1"
    );
    expect(nodeAriaLabel(claim("M1", { data: { kind: "mechanism" } }))).toContain(
      "mechanism M1"
    );
  });

  it("reads the badges, which the card draws as dots", () => {
    const label = nodeAriaLabel(
      claim("S1", { data: { forecast: 3, dossier: true } })
    );
    expect(label).toContain("3 forecasts");
    expect(label).toContain("has a dossier");
  });

  it("says one forecast, not 1 forecasts", () => {
    expect(nodeAriaLabel(claim("S1", { data: { forecast: 1 } }))).toBe(
      "symptom S1: S1 title, confidence 0.72, 1 forecast."
    );
  });

  it("marks a sandbox claim as unsigned and a filtered-out one as outside the domain", () => {
    expect(
      nodeAriaLabel(claim("S9", { data: { author: "agent:reader/v0" } }))
    ).toContain("unsigned sandbox claim");
    expect(nodeAriaLabel(claim("S1", { data: { outOfDomain: true } }))).toContain(
      "outside the active domain"
    );
  });
});

describe("edgeAriaLabel", () => {
  it("reads as the relation, which React Flow's fallback never says", () => {
    expect(edgeAriaLabel(edge("S1", "M1", { data: { kind: "reduces" } } as Partial<ClaimEdge>)))
      .toBe("S1 reduces M1.");
  });

  it("names the claims an edge joins even while it is drawn to a collapsed pill", () => {
    const collapsed = edge("__domain_inequality", "M1", {
      data: {
        kind: "causes",
        rationale: "",
        sources: [],
        crossDomain: false,
        outOfDomain: false,
        collapsedRemap: { source: { node: "IS1", handle: null } },
      },
    } as Partial<ClaimEdge>);
    expect(edgeAriaLabel(collapsed)).toBe("IS1 causes M1.");
  });

  it("says when there is a rationale to open, on either of the two things that make one", () => {
    const withRationale = edge("S1", "M1", {
      data: { kind: "causes", rationale: "because", sources: [], crossDomain: false, outOfDomain: false },
    } as Partial<ClaimEdge>);
    const withSource = edge("S1", "M1", {
      data: {
        kind: "causes",
        rationale: "",
        sources: [{ label: "paper", url: "https://example.org" }],
        crossDomain: false,
        outOfDomain: false,
      },
    } as Partial<ClaimEdge>);
    expect(edgeAriaLabel(withRationale)).toContain("has a rationale");
    expect(edgeAriaLabel(withSource)).toContain("has a rationale");
    expect(edgeAriaLabel(edge("S1", "M1"))).not.toContain("has a rationale");
  });

  it("flags a cross-domain edge, which the canvas otherwise shows only in ink", () => {
    const crossing = edge("S1", "IM1", {
      data: { kind: "causes", rationale: "", sources: [], crossDomain: true, outOfDomain: false },
    } as Partial<ClaimEdge>);
    expect(edgeAriaLabel(crossing)).toContain("cross-domain");
  });
});

describe("withNodeAriaLabels / withEdgeAriaLabels", () => {
  it("labels claims and leaves domain groups alone", () => {
    const out = withNodeAriaLabels([group("inequality"), claim("S1")]);
    expect(out[0].ariaLabel).toBeUndefined();
    expect(out[1].ariaLabel).toBe("symptom S1: S1 title, confidence 0.72.");
  });

  it("does not mutate the arrays the exporter and the sandbox read", () => {
    const nodes = [claim("S1")];
    const edges = [edge("S1", "M1")];
    withNodeAriaLabels(nodes);
    withEdgeAriaLabels(edges);
    expect(nodes[0].ariaLabel).toBeUndefined();
    expect(edges[0].ariaLabel).toBeUndefined();
  });

  it("labels every edge", () => {
    const out = withEdgeAriaLabels([edge("S1", "M1"), edge("M1", "L1")]);
    expect(out.map((e) => e.ariaLabel)).toEqual(["S1 causes M1.", "M1 causes L1."]);
  });
});

describe("canvasAriaLabels", () => {
  /**
   * The one that is easy to get wrong: React Flow picks the node description by
   * `disableKeyboardA11y`, and the key it uses when keyboard support is *on* is
   * the one named `keyboardDisabled`. Overriding only the obvious key leaves
   * every real reader on React Flow's default text.
   */
  it("overrides both node keys, because React Flow reads the other one", () => {
    const labels = canvasAriaLabels(true);
    expect(labels["node.a11yDescription.keyboardDisabled"]).toBe(
      labels["node.a11yDescription.default"]
    );
    expect(labels["node.a11yDescription.default"]).toContain("Enter");
  });

  it("describes moving and deleting only where they are possible", () => {
    expect(canvasAriaLabels(true)["node.a11yDescription.default"]).toContain("arrow keys");
    expect(canvasAriaLabels(false)["node.a11yDescription.default"]).not.toContain("arrow keys");
  });

  it("tells an edge's reader what Enter does, which differs by mode", () => {
    expect(canvasAriaLabels(true)["edge.a11yDescription.default"]).toContain("edit the relation");
    expect(canvasAriaLabels(false)["edge.a11yDescription.default"]).toContain("sources");
  });

  /**
   * Measured in the browser rather than reasoned about: Escape does close an
   * edge's rationale, and the focus still on the edge re-opens it in the same
   * frame, so the panel never visibly goes away. Promising a dismissal that
   * does nothing is worse than promising nothing.
   */
  it("does not offer Escape as a way to dismiss an edge's rationale", () => {
    expect(canvasAriaLabels(true)["edge.a11yDescription.default"]).not.toContain("dismiss");
    expect(canvasAriaLabels(false)["edge.a11yDescription.default"]).not.toContain("dismiss");
  });
});
