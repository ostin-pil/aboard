import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  STORE_SCHEMA_VERSION,
  clearPersisted,
  computeSeedHash,
  hydrateFromPersisted,
  loadPersisted,
  pruneLegacyStoreKeys,
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
  /** Counts mutations, so a test can assert a code path wrote nothing at all. */
  writes = 0;
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.writes++; this.m.set(k, v); }
  removeItem(k: string) { this.writes++; this.m.delete(k); }
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
  ])("reports unusable on %s, leaving the key for the caller to drop", (_label, raw) => {
    store().setItem(STORE_KEY, raw);
    expect(loadPersisted("seed-a")).toEqual({ status: "unusable" });
    // The load no longer clears: it runs during render to seed React Flow, and
    // render must not mutate storage. `ClaimGraphRFInner` clears in an effect.
    expect(store().getItem(STORE_KEY)).toBe(raw);
  });

  it("reports a schemaVersion mismatch as unusable", () => {
    store().setItem(
      STORE_KEY,
      JSON.stringify({ schemaVersion: STORE_SCHEMA_VERSION + 99, seedHash: "s", nodes: [], edges: [] })
    );
    expect(loadPersisted("s")).toEqual({ status: "unusable" });
  });

  it("loads a valid payload and reports no drift on a matching seed", () => {
    store().setItem(STORE_KEY, good());
    const out = loadPersisted("seed-a");
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.seedDrift).toBe(false);
    expect(out.persisted.nodes).toHaveLength(2);
  });

  it("loads a valid payload but reports drift on a changed seed", () => {
    store().setItem(STORE_KEY, good());
    const out = loadPersisted("seed-b");
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.seedDrift).toBe(true);
  });

  it("reports empty without a payload", () => {
    expect(loadPersisted("seed-a")).toEqual({ status: "empty" });
  });

  // The property the split exists for. Before it, the load pruned legacy keys
  // and cleared the store key mid-render, so a render React discarded had
  // already deleted the user's sandbox.
  it.each([
    ["nothing stored", null],
    ["a good payload", good()],
    ["non-JSON", "{not json"],
    ["a version mismatch", JSON.stringify({ schemaVersion: STORE_SCHEMA_VERSION + 99, seedHash: "s", nodes: [], edges: [] })],
  ])("writes nothing to storage with %s", (_label, raw) => {
    if (raw !== null) store().setItem(STORE_KEY, raw);
    store().setItem("aboard.graph.v2", "legacy");
    const before = store().writes;
    loadPersisted("seed-a");
    expect(store().writes).toBe(before);
    // Including the legacy key, which the load used to prune on every call.
    expect(store().getItem("aboard.graph.v2")).toBe("legacy");
  });
});

// The vectors the Zod schema used to catch, now caught by the hand-written
// guard that replaced it (P2: the schema pulled the largest chunk on the
// homepage into the bundle to validate a self-authored snapshot). Each entry
// is a whole stored payload differing from a valid one in exactly the field
// under test.
describe("loadPersisted structural guard (P2)", () => {
  const payload = (over: Record<string, unknown>) =>
    JSON.stringify({
      schemaVersion: STORE_SCHEMA_VERSION,
      seedHash: "s",
      nodes: [],
      edges: [],
      ...over,
    });
  const node = (over: Record<string, unknown>) =>
    payload({ nodes: [{ kind: "claim", id: "S1", position: { x: 0, y: 0 }, data: {}, ...over }] });
  const edge = (over: Record<string, unknown>) =>
    payload({ edges: [{ id: "e", source: "A", target: "B", data: {}, ...over }] });

  it.each([
    ["a top-level array", "[]"],
    ["a top-level scalar", '"aboard.graph.v3"'],
    ["schemaVersion as a string", payload({ schemaVersion: "1" })],
    ["seedHash as a number", payload({ seedHash: 7 })],
    ["nodes as an object", payload({ nodes: {} })],
    ["an unknown node kind", node({ kind: "mystery" })],
    ["a node missing its kind", node({ kind: undefined })],
    ["a node id as a number", node({ id: 7 })],
    ["a position missing y", node({ position: { x: 0 } })],
    ["a position with a string x", node({ position: { x: "0", y: 0 } })],
    ["a position with a null x", node({ position: { x: null, y: 0 } })],
    // JSON.parse("1e999") yields Infinity; z.number() accepted it, the guard
    // does not — an infinite coordinate is meaningless to the layout math.
    ["an infinite position", node({}).replace('"x":0', '"x":1e999')],
    ["node data as an array", node({ data: [] })],
    ["node data as a string", node({ data: "d" })],
    ["hidden as a string", node({ hidden: "true" })],
    ["parentId as a number", node({ parentId: 7 })],
    ["style as a scalar", node({ kind: "domainGroup", style: 3 })],
    ["style width as a string", node({ kind: "domainGroup", style: { width: "12" } })],
    ["a null edge element", payload({ edges: [null] })],
    ["an edge missing its target", edge({ target: undefined })],
    ["an edge sourceHandle as a number", edge({ sourceHandle: 7 })],
    ["an edge without data", edge({ data: undefined })],
  ])("rejects %s", (_label, raw) => {
    store().setItem(STORE_KEY, raw);
    expect(loadPersisted("s")).toEqual({ status: "unusable" });
  });

  it("accepts every optional field at once", () => {
    store().setItem(
      STORE_KEY,
      payload({
        nodes: [
          { kind: "claim", id: "S1", position: { x: 1, y: 2 }, parentId: "g", data: { kind: "symptom" }, hidden: true },
          { kind: "domainGroup", id: "g", position: { x: 0, y: 0 }, data: { domain: "d" }, style: { width: 100, height: 50 }, hidden: false },
        ],
        edges: [
          { id: "e", source: "S1", target: "S1", sourceHandle: "s-right", targetHandle: "t-left", data: { kind: "causes" }, hidden: true },
        ],
      })
    );
    expect(loadPersisted("s").status).toBe("ok");
  });

  it("tolerates unknown extra keys, keeping them", () => {
    // Zod stripped extras; the guard passes the payload through untouched.
    // hydrateFromPersisted reads named fields only, so extras are inert —
    // this pins that a future field added by a newer build does not brick
    // an older one's sandbox.
    store().setItem(STORE_KEY, node({ futureField: { deep: true } }));
    const out = loadPersisted("s");
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect((out.persisted.nodes[0] as Record<string, unknown>).futureField).toEqual({ deep: true });
  });
});

describe("pruneLegacyStoreKeys", () => {
  it("removes the pre-v3 key and leaves the current one", () => {
    store().setItem("aboard.graph.v2", "legacy");
    store().setItem(STORE_KEY, "current");
    pruneLegacyStoreKeys();
    expect(store().getItem("aboard.graph.v2")).toBeNull();
    expect(store().getItem(STORE_KEY)).toBe("current");
  });

  it("is idempotent, so StrictMode's double-invoked effect is harmless", () => {
    store().setItem("aboard.graph.v2", "legacy");
    pruneLegacyStoreKeys();
    expect(() => pruneLegacyStoreKeys()).not.toThrow();
    expect(store().getItem("aboard.graph.v2")).toBeNull();
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
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.seedDrift).toBe(false);
    expect(out.persisted.nodes).toHaveLength(2);
    expect(out.persisted.edges).toHaveLength(1);
  });

  it("clearPersisted removes the key", () => {
    savePersisted([], [], "s");
    clearPersisted();
    expect(store().getItem(STORE_KEY)).toBeNull();
  });
});
