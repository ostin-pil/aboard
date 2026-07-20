import { z } from "zod";
import type { ClaimEdge, GraphNode } from "./types";
import { isClaimNode, orderParentsFirst } from "./types";

// A transient overlay handle ("full-target") only exists during a
// connection drag; an edge persisted against it dangles forever and
// React Flow logs error #008. Drop any full-* handle on load — and any
// stringified nullish value ("null"/"undefined"), which can reach here
// through a persist round-trip and dangles the same way.
const cleanHandle = (h?: string) =>
  h && h !== "null" && h !== "undefined" && !h.startsWith("full-")
    ? h
    : undefined;

const STORE_KEY = "aboard.graph.v3";
const LEGACY_STORE_KEYS = ["aboard.graph.v2"];

// Bump when the persisted shape changes incompatibly. A stored payload whose
// version differs is unusable and dropped on load — local edits cannot survive
// a shape change. (Content drift, a data/ change under an unchanged shape, is a
// separate, non-destructive signal; see seedHash.)
export const STORE_SCHEMA_VERSION = 1;

// Runtime model of the persisted payload. Only the structure
// hydrateFromPersisted depends on is constrained; node and edge `data` stay
// loose, because a wrong leaf renders oddly at worst, while content drift is
// caught by seedHash rather than by validating every field here. Replaces the
// old hand-rolled truthiness checks, which inspected only nodes[0] and never
// looked at edges at all (so `{nodes:[],edges:{}}` slipped through and threw in
// the render-phase hydrate).
const position = z.object({ x: z.number(), y: z.number() });
const looseData = z.record(z.string(), z.unknown());
const persistedNode = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("claim"),
    id: z.string(),
    position,
    parentId: z.string().optional(),
    data: looseData,
    hidden: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("domainGroup"),
    id: z.string(),
    position,
    data: looseData,
    style: z
      .object({ width: z.number().optional(), height: z.number().optional() })
      .optional(),
    hidden: z.boolean().optional(),
  }),
]);
const persistedEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  data: looseData,
  hidden: z.boolean().optional(),
});
const persistedSchema = z.object({
  schemaVersion: z.number(),
  seedHash: z.string(),
  nodes: z.array(persistedNode),
  edges: z.array(persistedEdge),
});

type Persisted = z.infer<typeof persistedSchema>;

/**
 * Stable, cheap hash of the canonical seed's claim identities (`id:kind`).
 * Detects claims added to or removed from `data/` since a sandbox was saved,
 * without firing on the positions or bodies the user is free to edit. FNV-1a
 * over the sorted id:kind list.
 */
export function computeSeedHash(nodes: GraphNode[]): string {
  const key = nodes
    .filter(isClaimNode)
    .map((n) => `${n.id}:${n.data.kind}`)
    .sort()
    .join("|");
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Load the persisted sandbox, validated. Returns null (and clears the key) on
 * anything unusable: unreadable storage, non-JSON, a shape the schema rejects,
 * or a schemaVersion mismatch. On success reports `seedDrift` — whether the
 * stored seed differs from the current canonical one — so the caller can offer
 * a refresh without discarding the user's edits.
 */
export function loadPersisted(
  expectedSeedHash: string
): { persisted: Persisted; seedDrift: boolean } | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    for (const k of LEGACY_STORE_KEYS) {
      try { window.localStorage.removeItem(k); } catch { /* non-fatal */ }
    }
    raw = window.localStorage.getItem(STORE_KEY);
  } catch {
    return null; // storage unavailable; nothing to clear
  }
  if (!raw) return null;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    clearPersisted();
    return null;
  }

  const result = persistedSchema.safeParse(json);
  if (!result.success) {
    // Corrupt, or a pre-versioning payload — unusable shape. Drop and rebuild.
    clearPersisted();
    return null;
  }
  if (result.data.schemaVersion !== STORE_SCHEMA_VERSION) {
    // Schema drift: the stored shape predates the current one. Silent drop.
    clearPersisted();
    return null;
  }
  return {
    persisted: result.data,
    seedDrift: result.data.seedHash !== expectedSeedHash,
  };
}

export function savePersisted(
  nodes: GraphNode[],
  edges: ClaimEdge[],
  seedHash: string
) {
  if (typeof window === "undefined") return;
  try {
    const slim: Persisted = {
      schemaVersion: STORE_SCHEMA_VERSION,
      seedHash,
      nodes: orderParentsFirst(nodes).map((n) => {
        if (isClaimNode(n)) {
          return {
            kind: "claim" as const,
            id: n.id,
            position: n.position,
            data: n.data,
            ...(n.parentId ? { parentId: n.parentId } : {}),
            ...(n.hidden ? { hidden: true } : {}),
          };
        }
        return {
          kind: "domainGroup" as const,
          id: n.id,
          position: n.position,
          data: n.data,
          ...(n.style
            ? {
                style: {
                  width: n.style.width as number | undefined,
                  height: n.style.height as number | undefined,
                },
              }
            : {}),
          ...(n.hidden ? { hidden: true } : {}),
        };
      }),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data ?? {},
        ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
        ...(e.hidden ? { hidden: true } : {}),
      })),
    };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(slim));
  } catch {
    // localStorage may be unavailable; non-fatal
  }
}

export function clearPersisted() {
  if (typeof window === "undefined") return;
  try {
    // Removes the whole persisted graph — including collapsed-group state,
    // which lives only here. `reset` relies on this to return fully
    // expanded.
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // non-fatal
  }
}

export function hydrateFromPersisted(p: Persisted): { nodes: GraphNode[]; edges: ClaimEdge[] } {
  const nodes: GraphNode[] = p.nodes.map((n) => {
    if (n.kind === "claim") {
      const node = {
        id: n.id,
        type: "claim" as const,
        position: n.position,
        data: n.data,
        ...(n.parentId
          ? { parentId: n.parentId, extent: "parent" as const }
          : {}),
        ...(n.hidden ? { hidden: true } : {}),
      } as GraphNode;
      return node;
    }
    const g = {
      id: n.id,
      type: "domainGroup" as const,
      position: n.position,
      data: n.data,
      ...(n.style ? { style: n.style } : {}),
      // Match engineToRF: header drags the whole group; chevron button
      // inside uses `nodrag nopan` to stay clickable.
      draggable: true,
      selectable: false,
      focusable: false,
    } as GraphNode;
    return g;
  });
  const edges: ClaimEdge[] = p.edges.map((e) => {
    const sh = cleanHandle(e.sourceHandle);
    const th = cleanHandle(e.targetHandle);
    return {
      id: e.id,
      type: "claim",
      source: e.source,
      target: e.target,
      ...(sh ? { sourceHandle: sh } : {}),
      ...(th ? { targetHandle: th } : {}),
      // `data` is validated loosely (see persistedSchema): the structural gate
      // is what matters, and the render tolerates a stale-shaped edge data far
      // better than the loader would tolerate a rejected sandbox. Cast back to
      // the edge's data type; a genuinely wrong shape is a content problem the
      // seedHash drift path surfaces, not a crash.
      data: e.data as ClaimEdge["data"],
      ...(e.hidden ? { hidden: true } : {}),
    };
  });
  return { nodes: orderParentsFirst(nodes), edges };
}
