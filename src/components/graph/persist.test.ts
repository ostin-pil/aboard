import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  STORE_SCHEMA_VERSION,
  clearPersisted,
  computeSeedHash,
  hydrateFromPersisted,
  loadPersisted,
  savePersisted,
} from "./persist";
import type { ClaimEdge, GraphNode } from "./types";

// persist.ts guards every storage call on `typeof window`. The suite runs in the
// node environment (no DOM), so install a minimal in-memory window/localStorage.
// This is enough to exercise the validation and round-trip logic without pulling
// in jsdom.
const STORE_KEY = "aboard.graph.v3";

class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: new MemStore(),
  };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

function store(): MemStore {
  return (globalThis as unknown as { window: { localStorage: MemStore } }).window
    .localStorage;
}
function claim(id: string, kind: string): GraphNode {
  return {
    id,
    type: "claim",
    position: { x: 0, y: 0 },
    data: { kind },
  } as unknown as GraphNode;
}

describe("computeSeedHash", () => {
  it("is deterministic and order-independent", () => {
    const a = computeSeedHash([claim("S1", "symptom"), claim("M1", "mechanism")]);
    const b = computeSeedHash([claim("M1", "mechanism"), claim("S1", "symptom")]);
    expect(a).toBe(b);
  });

  it("changes when a claim is added or removed", () => {
    const base = computeSeedHash([claim("S1", "symptom")]);
    expect(computeSeedHash([claim("S1", "symptom"), claim("S2", "symptom")])).not.toBe(base);
    expect(computeSeedHash([])).not.toBe(base);
  });

  it("ignores everything except id and kind", () => {
    const a = computeSeedHash([claim("S1", "symptom")]);
    const moved = { ...claim("S1", "symptom") } as { position: { x: number; y: number } };
    moved.position = { x: 999, y: -50 };
    expect(computeSeedHash([moved as unknown as GraphNode])).toBe(a);
  });
});

describe("hydrateFromPersisted handle cleaning (N2)", () => {
  const base = {
    schemaVersion: STORE_SCHEMA_VERSION,
    seedHash: "x",
    nodes: [],
  };
  function edge(sourceHandle: string | undefined) {
    return { ...base, edges: [{ id: "e", source: "A", target: "B", data: {}, sourceHandle }] };
  }

  it("drops stringified null and undefined handles", () => {
    expect(hydrateFromPersisted(edge("null") as never).edges[0].sourceHandle).toBeUndefined();
    expect(hydrateFromPersisted(edge("undefined") as never).edges[0].sourceHandle).toBeUndefined();
  });
  it("drops transient full-* handles", () => {
    expect(hydrateFromPersisted(edge("full-target") as never).edges[0].sourceHandle).toBeUndefined();
  });
  it("keeps a real handle", () => {
    expect(hydrateFromPersisted(edge("s-right") as never).edges[0].sourceHandle).toBe("s-right");
  });
});

describe("loadPersisted validation (E2)", () => {
  const good = () =>
    JSON.stringify({
      schemaVersion: STORE_SCHEMA_VERSION,
      seedHash: "seed-a",
      nodes: [
        { kind: "domainGroup", id: "g", position: { x: 0, y: 0 }, data: { domain: "d" } },
        { kind: "claim", id: "S1", position: { x: 1, y: 2 }, data: { kind: "symptom" } },
      ],
      edges: [{ id: "e", source: "S1", target: "S1", data: { kind: "causes" } }],
    });

  it.each([
    ["edges as an object, not an array", JSON.stringify({ schemaVersion: 1, seedHash: "s", nodes: [], edges: {} })],
    ["a null node element", JSON.stringify({ schemaVersion: 1, seedHash: "s", nodes: [null], edges: [] })],
    ["a malformed element at index 3", JSON.stringify({ schemaVersion: 1, seedHash: "s", nodes: [
      { kind: "claim", id: "S1", position: { x: 0, y: 0 }, data: {} },
      { kind: "claim", id: "S2", position: { x: 0, y: 0 }, data: {} },
      { kind: "claim", id: "S3", position: { x: 0, y: 0 }, data: {} },
      { kind: "claim", id: "S4", position: "nope", data: {} },
    ], edges: [] })],
    ["valid JSON of the wrong shape (no version)", JSON.stringify({ nodes: [], edges: [] })],
    ["non-JSON", "{not json"],
  ])("returns null and clears the key on %s", (_label, raw) => {
    store().setItem(STORE_KEY, raw);
    expect(loadPersisted("seed-a")).toBeNull();
    expect(store().getItem(STORE_KEY)).toBeNull();
  });

  it("drops a schemaVersion mismatch silently", () => {
    store().setItem(
      STORE_KEY,
      JSON.stringify({ schemaVersion: STORE_SCHEMA_VERSION + 99, seedHash: "s", nodes: [], edges: [] })
    );
    expect(loadPersisted("s")).toBeNull();
    expect(store().getItem(STORE_KEY)).toBeNull();
  });

  it("loads a valid payload and reports no drift on a matching seed", () => {
    store().setItem(STORE_KEY, good());
    const out = loadPersisted("seed-a");
    expect(out).not.toBeNull();
    expect(out!.seedDrift).toBe(false);
    expect(out!.persisted.nodes).toHaveLength(2);
  });

  it("loads a valid payload but reports drift on a changed seed", () => {
    store().setItem(STORE_KEY, good());
    const out = loadPersisted("seed-b");
    expect(out).not.toBeNull();
    expect(out!.seedDrift).toBe(true);
  });

  it("returns null without a payload", () => {
    expect(loadPersisted("seed-a")).toBeNull();
  });
});

describe("savePersisted round-trip (E3 stamping)", () => {
  it("stamps the version and seed hash so load accepts it", () => {
    const nodes: GraphNode[] = [
      { id: "g", type: "domainGroup", position: { x: 0, y: 0 }, data: { domain: "d" } } as unknown as GraphNode,
      { id: "S1", type: "claim", position: { x: 1, y: 1 }, parentId: "g", data: { kind: "symptom" } } as unknown as GraphNode,
    ];
    const edges: ClaimEdge[] = [
      { id: "e", type: "claim", source: "S1", target: "S1", data: { kind: "causes" } } as unknown as ClaimEdge,
    ];
    savePersisted(nodes, edges, "seed-z");
    const out = loadPersisted("seed-z");
    expect(out).not.toBeNull();
    expect(out!.seedDrift).toBe(false);
    expect(out!.persisted.nodes).toHaveLength(2);
    expect(out!.persisted.edges).toHaveLength(1);
  });

  it("clearPersisted removes the key", () => {
    savePersisted([], [], "s");
    clearPersisted();
    expect(store().getItem(STORE_KEY)).toBeNull();
  });
});
