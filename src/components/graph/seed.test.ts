import { describe, it, expect } from "vitest";
import { resolveSeed } from "./seed";
import type { LoadOutcome } from "./persist";
import type { ClaimEdge, GraphNode } from "./types";

/**
 * Which graph the canvas mounts with. Every branch here has been a bug: the
 * landing page once showed a visitor's editor sandbox, and a snapshot from
 * before multi-domain landed once rehydrated into an inert graph with no
 * groups. Both were fixed inside a `useMemo` where no test could reach them.
 */

const canonical = {
  nodes: [
    { id: "__domain_x", type: "domainGroup", position: { x: 0, y: 0 }, data: { domain: "x" } },
    { id: "S1", type: "claim", position: { x: 0, y: 0 }, data: { title: "canonical" } },
  ] as unknown as GraphNode[],
  edges: [] as ClaimEdge[],
};

/** A stored payload, in the persisted (pre-hydrate) shape. */
const stored = (kinds: ("claim" | "domainGroup")[]): LoadOutcome => ({
  status: "ok",
  seedDrift: false,
  persisted: {
    schemaVersion: 1,
    seedHash: "h",
    nodes: kinds.map((kind, i) => ({
      kind,
      id: `${kind}-${i}`,
      position: { x: 0, y: 0 },
      data: { title: "stored" },
    })),
    edges: [],
  },
} as unknown as LoadOutcome);

describe("resolveSeed", () => {
  it("builds fresh in inline mode, never reading the sandbox", () => {
    const out = resolveSeed(canonical, "h", "inline", stored(["domainGroup", "claim"]));
    expect(out.nodes).toBe(canonical.nodes);
    expect(out.dropStored).toBe(false);
    expect(out.seedDrift).toBe(false);
  });

  it("restores a usable sandbox in fullbleed", () => {
    const out = resolveSeed(canonical, "h", "fullbleed", stored(["domainGroup", "claim"]));
    expect(out.nodes.map((n) => n.id)).toEqual(["domainGroup-0", "claim-1"]);
    expect(out.dropStored).toBe(false);
  });

  // A snapshot with no group node predates multi-domain and would rehydrate
  // into a graph the editor cannot work with.
  it("rebuilds from canonical when the sandbox has no domain group", () => {
    const out = resolveSeed(canonical, "h", "fullbleed", stored(["claim", "claim"]));
    expect(out.nodes).toBe(canonical.nodes);
    expect(out.dropStored).toBe(true);
  });

  it("reports drift without discarding the user's edits", () => {
    const drifted = { ...stored(["domainGroup", "claim"]), seedDrift: true } as LoadOutcome;
    const out = resolveSeed(canonical, "h", "fullbleed", drifted);
    expect(out.seedDrift).toBe(true);
    expect(out.nodes.map((n) => n.id)).toEqual(["domainGroup-0", "claim-1"]);
    expect(out.dropStored).toBe(false);
  });

  it("asks for a deletion when something unusable is stored", () => {
    const out = resolveSeed(canonical, "h", "fullbleed", { status: "unusable" });
    expect(out.nodes).toBe(canonical.nodes);
    expect(out.dropStored).toBe(true);
  });

  // `empty` means there is nothing in storage. Asking for a deletion anyway
  // would be a write on every mount for a visitor who has never edited.
  it("asks for nothing when storage is empty", () => {
    const out = resolveSeed(canonical, "h", "fullbleed", { status: "empty" });
    expect(out.nodes).toBe(canonical.nodes);
    expect(out.dropStored).toBe(false);
  });

  it("carries the seed hash through every branch", () => {
    const outcomes: LoadOutcome[] = [
      { status: "empty" },
      { status: "unusable" },
      stored(["domainGroup"]),
    ];
    for (const outcome of outcomes) {
      expect(resolveSeed(canonical, "hash-1", "fullbleed", outcome).seedHash).toBe("hash-1");
    }
  });
});
