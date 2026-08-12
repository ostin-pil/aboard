import { describe, it, expect } from "vitest";
import { alignColumn, distributeX } from "./align";
import { LAYOUT } from "./engine-to-rf";
import {
  applyEdgeDomainFlags,
  applyNodeDomainFlags,
  applyXPositions,
  claimsInDomain,
  groupClaimsInto,
  moveClaimsToRow,
  resolveExpandTarget,
  saveClaimNode,
} from "./graph-ops";
import type { ClaimEdge, ClaimNode, GraphNode } from "./types";
import { isClaimNode, isGroupNode } from "./types";

/**
 * The canvas mutations, previously the bodies of `setNodes`/`setEdges`
 * updaters inside `ClaimGraphRF.tsx` and reachable only by rendering the whole
 * component. Slot arithmetic, reparenting and coordinate-space conversion are
 * the parts of that file that can be quietly wrong, and these are them.
 */

const FB = LAYOUT.fullbleed;
const GROUP = "__domain_inequality";

function group(domain: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id: `__domain_${domain}`,
    type: "domainGroup",
    position: { x: 0, y: 0 },
    data: { domain, claimCount: 0, collapsed: false },
    style: { width: 800, height: 700 },
    ...over,
  } as unknown as GraphNode;
}

type ClaimOverrides = Omit<Partial<ClaimNode>, "data"> & {
  data?: Partial<ClaimNode["data"]>;
};

function claim(id: string, over: ClaimOverrides = {}): ClaimNode {
  const { data, ...rest } = over;
  return {
    id,
    type: "claim",
    position: { x: 60, y: 56 },
    data: {
      kind: "symptom",
      title: id,
      body: "",
      meta: "",
      conf: 0,
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

const inGroup = (id: string, over: ClaimOverrides = {}) =>
  claim(id, {
    parentId: GROUP,
    extent: "parent",
    ...over,
    data: { domain: "inequality", ...over.data },
  });

const edge = (source: string, target: string, over: Partial<ClaimEdge> = {}): ClaimEdge =>
  ({
    id: `${source}->${target}`,
    type: "claim",
    source,
    target,
    data: { kind: "causes", rationale: "", sources: [], crossDomain: false, outOfDomain: false },
    ...over,
  }) as unknown as ClaimEdge;

describe("resolveExpandTarget", () => {
  const collapsed = group("inequality", {
    data: { domain: "inequality", claimCount: 2, collapsed: true },
  } as Partial<GraphNode>);
  const nodes = [collapsed, inGroup("IS1"), inGroup("IS2")];

  it("names the group and its prior children when a new claim files into it", () => {
    const target = resolveExpandTarget(nodes, inGroup("IS9"), "fullbleed");
    expect(target?.groupId).toBe(GROUP);
    expect(target?.childIds).toEqual(new Set(["IS1", "IS2"]));
  });

  // Retitling a claim that already sits inside a collapsed group must not pop
  // the group open: nothing moved.
  it("is null when the claim is already in that domain", () => {
    const retitled = inGroup("IS1", { data: { title: "new title" } });
    expect(resolveExpandTarget(nodes, retitled, "fullbleed")).toBeNull();
  });

  it("is null when the target group is expanded", () => {
    const open = [group("inequality"), inGroup("IS1")];
    expect(resolveExpandTarget(open, inGroup("IS9"), "fullbleed")).toBeNull();
  });

  it("is null in inline mode, which has no groups", () => {
    expect(resolveExpandTarget(nodes, inGroup("IS9"), "inline")).toBeNull();
  });
});

describe("saveClaimNode", () => {
  it("appends a new claim into its domain group, slotted after its row siblings", () => {
    const nodes = [group("inequality"), inGroup("IS1", { data: { row: 1, col: 0 } })];
    const out = saveClaimNode(nodes, inGroup("IS2", { data: { row: 1 } }), "fullbleed", null);
    const saved = out.find((n) => n.id === "IS2") as ClaimNode;
    expect(saved.parentId).toBe(GROUP);
    expect(saved.extent).toBe("parent");
    expect(saved.data.col).toBe(1);
    expect(saved.position.x).toBe(FB.padX + 1 * (FB.nodeW + FB.colGap));
    expect(saved.position.y).toBe(FB.padY + FB.groupHeaderH + FB.rowY[1]);
  });

  // The claim was placed by hand; an unrelated edit must not drag it back into
  // a grid slot.
  it("leaves position and parent alone when the domain did not change", () => {
    const placed = inGroup("IS1", { position: { x: 777, y: 333 } });
    const out = saveClaimNode(
      [group("inequality"), placed],
      inGroup("IS1", { position: { x: 0, y: 0 }, data: { title: "edited" } }),
      "fullbleed",
      null
    );
    const saved = out.find((n) => n.id === "IS1") as ClaimNode;
    expect(saved.position).toEqual({ x: 777, y: 333 });
    expect(saved.parentId).toBe(GROUP);
    expect(saved.data.title).toBe("edited");
  });

  it("creates the domain group when the domain does not exist yet", () => {
    const out = saveClaimNode([], claim("X1", { data: { domain: "newdom" } }), "fullbleed", null);
    const created = out.find(isGroupNode);
    expect(created?.id).toBe("__domain_newdom");
    expect(created?.draggable).toBe(true);
    expect(out.indexOf(created as GraphNode)).toBeLessThan(
      out.findIndex((n) => n.id === "X1")
    );
  });

  // Clearing the domain ungroups the claim. Its stored position is relative to
  // the group it is leaving, so without the conversion it jumps to the origin.
  it("converts a cleared claim's position from local to absolute", () => {
    const parent = group("inequality", { position: { x: 500, y: 0 } } as Partial<GraphNode>);
    const child = inGroup("IS1", { position: { x: 60, y: 56 } });
    const out = saveClaimNode(
      [parent, child],
      claim("IS1", { position: { x: 60, y: 56 }, data: { domain: undefined } }),
      "fullbleed",
      null
    );
    const saved = out.find((n) => n.id === "IS1") as ClaimNode;
    expect(saved.position).toEqual({ x: 560, y: 56 });
    expect(saved.parentId).toBeUndefined();
    expect(saved.extent).toBeUndefined();
  });

  it("expands the target group when the save files into a collapsed one", () => {
    const collapsed = group("inequality", {
      data: { domain: "inequality", claimCount: 1, collapsed: true },
      style: { width: 220, height: 56 },
    } as Partial<GraphNode>);
    const nodes = [collapsed, inGroup("IS1", { hidden: true })];
    const draft = inGroup("IS2");
    const target = resolveExpandTarget(nodes, draft, "fullbleed");
    const out = saveClaimNode(nodes, draft, "fullbleed", target);
    const g = out.find(isGroupNode)!;
    expect(g.data.collapsed).toBe(false);
    expect(out.find((n) => n.id === "IS1")!.hidden).toBe(false);
    expect(g.style!.width as number).toBeGreaterThan(220);
  });

  it("appends without grouping in inline mode", () => {
    const out = saveClaimNode([], claim("S1", { data: { domain: "inequality" } }), "inline", null);
    expect(out).toHaveLength(1);
    expect((out[0] as ClaimNode).parentId).toBeUndefined();
  });
});

describe("groupClaimsInto", () => {
  it("reparents the selection into fresh slots after the group's existing children", () => {
    const nodes = [
      group("inequality"),
      inGroup("IS1", { data: { row: 1, col: 0 } }),
      claim("M1", { position: { x: 900, y: 300 }, data: { row: 2 } }),
      claim("M2", { position: { x: 1200, y: 300 }, data: { row: 2 } }),
    ];
    const out = groupClaimsInto(nodes, new Set(["M1", "M2"]), "inequality", "fullbleed");
    const moved = out.filter((n): n is ClaimNode => isClaimNode(n) && n.id.startsWith("M"));
    expect(moved.map((n) => n.parentId)).toEqual([GROUP, GROUP]);
    expect(moved.map((n) => n.data.domain)).toEqual(["inequality", "inequality"]);
    expect(moved.map((n) => n.data.col)).toEqual([0, 1]);
    expect(moved.map((n) => n.position.x)).toEqual([
      FB.padX,
      FB.padX + FB.nodeW + FB.colGap,
    ]);
    expect(moved.every((n) => n.selected === false)).toBe(true);
  });

  // The counter starts past the claims already in the group, or the moved ones
  // land on top of them.
  it("counts existing children of the target row before slotting", () => {
    const nodes = [
      group("inequality"),
      inGroup("IS1", { data: { row: 1, col: 0 } }),
      inGroup("IS2", { data: { row: 1, col: 1 } }),
      claim("S9", { data: { row: 1 } }),
    ];
    const out = groupClaimsInto(nodes, new Set(["S9"]), "inequality", "fullbleed");
    const moved = out.find((n) => n.id === "S9") as ClaimNode;
    expect(moved.data.col).toBe(2);
    expect(moved.position.x).toBe(FB.padX + 2 * (FB.nodeW + FB.colGap));
  });

  // A claim already inside the target group is being re-slotted, not joined by
  // a newcomer, so it must not also be counted as an occupant. Counting it
  // leaves column 0 empty and pushes the whole selection one slot right.
  it("does not count a selected claim that is already in the group", () => {
    const nodes = [
      group("inequality"),
      inGroup("IS1", { data: { row: 1, col: 0 } }),
      claim("S9", { data: { row: 1 } }),
    ];
    const out = groupClaimsInto(nodes, new Set(["IS1", "S9"]), "inequality", "fullbleed");
    const cols = out
      .filter((n): n is ClaimNode => isClaimNode(n))
      .map((n) => n.data.col);
    expect(cols).toEqual([0, 1]);
    expect(
      out.filter(isClaimNode).map((n) => n.position.x)
    ).toEqual([FB.padX, FB.padX + FB.nodeW + FB.colGap]);
  });

  it("creates the group when it does not exist", () => {
    const out = groupClaimsInto([claim("S1")], new Set(["S1"]), "brandnew", "fullbleed");
    expect(out.find(isGroupNode)?.id).toBe("__domain_brandnew");
  });
});

describe("moveClaimsToRow", () => {
  it("moves data.row and position.y together", () => {
    const nodes = [group("inequality"), inGroup("IS1", { data: { row: 1 } })];
    const out = moveClaimsToRow(nodes, new Set(["IS1"]), 3, "fullbleed");
    const moved = out.find((n) => n.id === "IS1") as ClaimNode;
    expect(moved.data.row).toBe(3);
    expect(moved.position.y).toBe(FB.padY + FB.groupHeaderH + FB.rowY[3]);
  });

  // A grouped claim's Y is relative to its group; an ungrouped one's is
  // absolute. A mixed selection has to land correctly in both spaces.
  it("uses each claim's own coordinate space", () => {
    const nodes = [group("inequality"), inGroup("IS1"), claim("M1", { data: { row: 2 } })];
    const out = moveClaimsToRow(nodes, new Set(["IS1", "M1"]), 2, "fullbleed");
    const grouped = out.find((n) => n.id === "IS1") as ClaimNode;
    const loose = out.find((n) => n.id === "M1") as ClaimNode;
    expect(grouped.position.y).toBe(FB.padY + FB.groupHeaderH + FB.rowY[2]);
    expect(loose.position.y).toBe(FB.rowY[2]);
  });

  it("leaves unselected claims alone", () => {
    const other = claim("M1");
    const out = moveClaimsToRow([other], new Set(["IS1"]), 3, "fullbleed");
    expect(out[0]).toBe(other);
  });
});

describe("applyXPositions", () => {
  // Claims in different groups are aligned in absolute X and converted back,
  // so the two end up visually aligned despite different parent offsets. Local
  // X differs by exactly the offset between their groups; absolute X does not.
  it("aligns across groups by converting through absolute X", () => {
    const nodes = [
      group("inequality", { position: { x: 0, y: 0 } } as Partial<GraphNode>),
      group("other", { position: { x: 100, y: 0 } } as Partial<GraphNode>),
      claim("IS1", { parentId: GROUP, extent: "parent", position: { x: 300, y: 56 } }),
      claim("OS1", { parentId: "__domain_other", extent: "parent", position: { x: 60, y: 56 } }),
    ];
    const out = applyXPositions(nodes, new Set(["IS1", "OS1"]), alignColumn, "fullbleed");
    const is1 = out.find((n) => n.id === "IS1") as ClaimNode;
    const os1 = out.find((n) => n.id === "OS1") as ClaimNode;
    expect(0 + is1.position.x).toBe(160);
    expect(100 + os1.position.x).toBe(160);
  });

  // A negative local X would put the claim outside its own parent.
  it("clamps a grouped claim to the group's left padding", () => {
    const nodes = [
      group("inequality", { position: { x: 1000, y: 0 } } as Partial<GraphNode>),
      claim("IS1", { parentId: GROUP, extent: "parent", position: { x: 1060, y: 56 } }),
      claim("M1", { position: { x: 0, y: 56 } }),
    ];
    const out = applyXPositions(nodes, new Set(["IS1", "M1"]), alignColumn, "fullbleed");
    const is1 = out.find((n) => n.id === "IS1") as ClaimNode;
    expect(is1.position.x).toBe(FB.padX);
  });

  it("returns the list unchanged when the computation yields nothing", () => {
    const nodes = [claim("S1"), claim("S2")];
    const out = applyXPositions(nodes, new Set(["S1"]), distributeX, "fullbleed");
    expect(out).toBe(nodes);
  });
});

describe("domain filtering", () => {
  const nodes = [
    group("inequality"),
    inGroup("IS1"),
    claim("M1", { data: { domain: "democratic_backsliding" } }),
  ];

  it("collects the claims of one domain", () => {
    expect(claimsInDomain(nodes, "inequality")).toEqual(new Set(["IS1"]));
  });

  it("flags claims outside the active domain and leaves groups alone", () => {
    const out = applyNodeDomainFlags(nodes, new Set(["IS1"]));
    expect((out.find((n) => n.id === "IS1") as ClaimNode).data.outOfDomain).toBe(false);
    expect((out.find((n) => n.id === "M1") as ClaimNode).data.outOfDomain).toBe(true);
    expect(out.find(isGroupNode)).toBe(nodes[0]);
  });

  it("clears every flag when no domain is active", () => {
    const flagged = applyNodeDomainFlags(nodes, new Set(["IS1"]));
    const cleared = applyNodeDomainFlags(flagged, null);
    expect(
      cleared.filter(isClaimNode).every((n) => n.data.outOfDomain === false)
    ).toBe(true);
  });

  // Identity for unchanged nodes is what keeps the filter effect from
  // re-rendering the whole canvas on an unrelated change.
  it("returns unchanged nodes by identity", () => {
    const once = applyNodeDomainFlags(nodes, new Set(["IS1"]));
    const twice = applyNodeDomainFlags(once, new Set(["IS1"]));
    expect(twice[1]).toBe(once[1]);
    expect(twice[2]).toBe(once[2]);
  });

  it("flags an edge unless both endpoints are in the domain", () => {
    const inDomain = new Set(["IS1", "IS2"]);
    const out = applyEdgeDomainFlags(
      [edge("IS1", "IS2"), edge("IS1", "M1")],
      inDomain
    );
    expect(out[0].data?.outOfDomain).toBe(false);
    expect(out[1].data?.outOfDomain).toBe(true);
  });

  it("clears edge flags when no domain is active", () => {
    const flagged = applyEdgeDomainFlags([edge("IS1", "M1")], new Set(["IS1"]));
    expect(applyEdgeDomainFlags(flagged, null)[0].data?.outOfDomain).toBe(false);
  });
});
