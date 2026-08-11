import { describe, it, expect } from "vitest";
import { expandGroupEdges, expandGroupNodes } from "./engine-to-rf";
import type { ClaimEdge, GraphNode } from "./types";

/**
 * Expanding a collapsed domain group. Extracted from `toggleDomainCollapse`
 * because a second caller needed it: filing a claim into a collapsed group
 * used to run none of this, which is E7 — the claim landed visible and
 * detached below the pill with edges drawn to hidden siblings.
 *
 * These tests pin the transform both callers now share.
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
