import { describe, it, expect } from "vitest";
import {
  collapseGroupEdges,
  collapseGroupNodes,
  expandGroupEdges,
  expandGroupNodes,
} from "./engine-to-rf";
import type { ClaimEdge, GraphNode } from "./types";

/**
 * Collapsing and expanding a domain group. Expand was extracted from
 * `toggleDomainCollapse` in session 54 because a second caller needed it:
 * filing a claim into a collapsed group used to run none of this, which is E7
 * — the claim landed visible and detached below the pill with edges drawn to
 * hidden siblings. Collapse followed it out here in session 55, so both
 * directions of the same geometry are testable rather than only one.
 */

const GROUP = "__domain_inequality";

function group(collapsed: boolean): GraphNode {
  return {
    id: GROUP,
    type: "domainGroup",
    position: { x: 0, y: 0 },
    data: { domain: "inequality", claimCount: 2, collapsed },
    style: collapsed ? { width: 220, height: 56 } : { width: 800, height: 600 },
  } as unknown as GraphNode;
}

function child(id: string, hidden: boolean, x = 60): GraphNode {
  return {
    id,
    type: "claim",
    parentId: GROUP,
    extent: "parent",
    position: { x, y: 56 },
    hidden,
    data: { kind: "symptom", row: 1, col: 0 },
  } as unknown as GraphNode;
}

function outsider(id: string): GraphNode {
  return {
    id,
    type: "claim",
    position: { x: 900, y: 56 },
    data: { kind: "mechanism", row: 2, col: 0 },
  } as unknown as GraphNode;
}

const edge = (over: Partial<ClaimEdge> & Pick<ClaimEdge, "id">): ClaimEdge =>
  ({
    type: "claim",
    source: "IS1",
    target: "IS2",
    data: { kind: "causes" },
    ...over,
  }) as unknown as ClaimEdge;

describe("expandGroupNodes", () => {
  const childIds = new Set(["IS1", "IS2"]);
  const collapsed = [group(true), child("IS1", true), child("IS2", true, 340), outsider("M1")];

  it("clears the collapsed flag and un-hides the children", () => {
    const out = expandGroupNodes(collapsed, GROUP, childIds, "fullbleed");
    const g = out.find((n) => n.id === GROUP)!;
    expect((g.data as { collapsed: boolean }).collapsed).toBe(false);
    expect(out.filter((n) => childIds.has(n.id)).every((n) => n.hidden === false)).toBe(true);
  });

  // The pill's cached 220x56 is what crushes the re-shown children into a
  // corner if it survives the expand.
  it("resizes the group from its now-visible children", () => {
    const out = expandGroupNodes(collapsed, GROUP, childIds, "fullbleed");
    const g = out.find((n) => n.id === GROUP)!;
    expect(g.style?.width).toBeTypeOf("number");
    expect(g.style!.width as number).toBeGreaterThan(220);
    expect(g.style!.height as number).toBeGreaterThan(56);
  });

  it("leaves nodes outside the group alone", () => {
    const out = expandGroupNodes(collapsed, GROUP, childIds, "fullbleed");
    const m1 = out.find((n) => n.id === "M1")!;
    expect(m1).toEqual(collapsed.find((n) => n.id === "M1"));
  });

  it("does nothing to a second, still-collapsed group", () => {
    const other = {
      ...(group(true) as unknown as Record<string, unknown>),
      id: "__domain_other",
    } as unknown as GraphNode;
    const out = expandGroupNodes([...collapsed, other], GROUP, childIds, "fullbleed");
    const g = out.find((n) => n.id === "__domain_other")!;
    expect((g.data as { collapsed: boolean }).collapsed).toBe(true);
    expect(g.style?.width).toBe(220);
  });
});

describe("expandGroupEdges", () => {
  const childIds = new Set(["IS1", "IS2"]);

  it("un-hides an edge that ran between two children", () => {
    const out = expandGroupEdges(
      [edge({ id: "internal", source: "IS1", target: "IS2", hidden: true })],
      childIds
    );
    expect(out[0].hidden).toBe(false);
  });

  it("points a boundary edge back at the child, restoring its handle", () => {
    const collapsedEdge = edge({
      id: "boundary",
      source: GROUP,
      target: "M1",
      sourceHandle: null,
      data: {
        kind: "causes",
        collapsedRemap: { source: { node: "IS1", handle: "s-bottom" } },
      },
    } as Partial<ClaimEdge> & Pick<ClaimEdge, "id">);
    const [out] = expandGroupEdges([collapsedEdge], childIds);
    expect(out.source).toBe("IS1");
    expect(out.sourceHandle).toBe("s-bottom");
    expect(out.target).toBe("M1");
    expect(out.data?.collapsedRemap).toBeUndefined();
  });

  // An edge between two collapsed groups: expanding one must not un-point the
  // end that still lives inside the other.
  it("keeps the other group's remap when only this group expands", () => {
    const crossing = edge({
      id: "crossing",
      source: GROUP,
      target: "__domain_other",
      data: {
        kind: "causes",
        collapsedRemap: {
          source: { node: "IS1", handle: null },
          target: { node: "OS1", handle: null },
        },
      },
    } as Partial<ClaimEdge> & Pick<ClaimEdge, "id">);
    const [out] = expandGroupEdges([crossing], childIds);
    expect(out.source).toBe("IS1");
    expect(out.target).toBe("__domain_other");
    expect(out.data?.collapsedRemap?.source).toBeUndefined();
    expect(out.data?.collapsedRemap?.target).toEqual({ node: "OS1", handle: null });
  });

  it("leaves an unrelated edge untouched", () => {
    const unrelated = edge({ id: "far", source: "M1", target: "L1" });
    const [out] = expandGroupEdges([unrelated], childIds);
    expect(out).toBe(unrelated);
  });
});

describe("collapseGroupNodes", () => {
  const childIds = new Set(["IS1", "IS2"]);
  const expanded = [group(false), child("IS1", false), child("IS2", false, 340), outsider("M1")];

  it("sets the collapsed flag and the fixed pill size", () => {
    const out = collapseGroupNodes(expanded, GROUP, childIds);
    const g = out.find((n) => n.id === GROUP)!;
    expect((g.data as { collapsed: boolean }).collapsed).toBe(true);
    expect(g.style?.width).toBe(220);
    expect(g.style?.height).toBe(56);
  });

  it("hides the children", () => {
    const out = collapseGroupNodes(expanded, GROUP, childIds);
    expect(out.filter((n) => childIds.has(n.id)).every((n) => n.hidden === true)).toBe(true);
  });

  it("leaves nodes outside the group alone", () => {
    const out = collapseGroupNodes(expanded, GROUP, childIds);
    expect(out.find((n) => n.id === "M1")).toBe(expanded.find((n) => n.id === "M1"));
  });
});

describe("collapseGroupEdges", () => {
  const childIds = new Set(["IS1", "IS2"]);

  it("hides an edge that runs between two children", () => {
    const out = collapseGroupEdges(
      [edge({ id: "internal", source: "IS1", target: "IS2" })],
      GROUP,
      childIds
    );
    expect(out[0].hidden).toBe(true);
    expect(out[0].source).toBe("IS1");
  });

  it("re-points a boundary edge at the pill and stashes the real endpoint", () => {
    const [out] = collapseGroupEdges(
      [edge({ id: "boundary", source: "IS1", target: "M1", sourceHandle: "s-bottom" })],
      GROUP,
      childIds
    );
    expect(out.source).toBe(GROUP);
    expect(out.sourceHandle).toBeNull();
    expect(out.target).toBe("M1");
    expect(out.hidden).toBe(false);
    expect(out.data?.collapsedRemap?.source).toEqual({ node: "IS1", handle: "s-bottom" });
    expect(out.data?.collapsedRemap?.target).toBeUndefined();
  });

  it("leaves an edge with neither end inside untouched", () => {
    const unrelated = edge({ id: "far", source: "M1", target: "L1" });
    const [out] = collapseGroupEdges([unrelated], GROUP, childIds);
    expect(out).toBe(unrelated);
  });

  // The pair is only correct if it composes: what collapse stashes is exactly
  // what expand needs to put back. Testing either alone would miss a change to
  // the remap shape that both halves agree on and no caller can use.
  it("round-trips a boundary edge through expand", () => {
    const original = edge({
      id: "boundary",
      source: "IS1",
      target: "M1",
      sourceHandle: "s-bottom",
    });
    const [restored] = expandGroupEdges(
      collapseGroupEdges([original], GROUP, childIds),
      childIds
    );
    expect(restored.source).toBe("IS1");
    expect(restored.sourceHandle).toBe("s-bottom");
    expect(restored.target).toBe("M1");
    expect(restored.data?.collapsedRemap).toBeUndefined();
  });

  // An edge already re-pointed by a *different* group's collapse keeps that
  // group's remap: collapsing the second group must add to the stash, not
  // replace it, or expanding the first can never find its endpoint again.
  it("keeps another group's remap when a second group collapses", () => {
    const crossing = edge({
      id: "crossing",
      source: "__domain_other",
      target: "IS2",
      data: {
        kind: "causes",
        collapsedRemap: { source: { node: "OS1", handle: null } },
      },
    } as Partial<ClaimEdge> & Pick<ClaimEdge, "id">);
    const [out] = collapseGroupEdges([crossing], GROUP, childIds);
    expect(out.source).toBe("__domain_other");
    expect(out.target).toBe(GROUP);
    expect(out.data?.collapsedRemap?.source).toEqual({ node: "OS1", handle: null });
    expect(out.data?.collapsedRemap?.target).toEqual({ node: "IS2", handle: null });
  });
});
