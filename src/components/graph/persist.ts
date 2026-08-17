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
//
// Guarded by hand, not by Zod: this module rides the client bundle of every
// page with a graph, and the Zod chunk it pulled in was the largest single
// chunk on the homepage (~287 KB raw / ~65 KB gzip) — spent validating a
// self-authored, single-origin localStorage snapshot. The guard checks the
// same structure the schema did, with one deliberate tightening: positions
// must be finite, where z.number() rejected only NaN and let Infinity
// through to the layout math.
type PersistedPosition = { x: number; y: number };
type LooseData = Record<string, unknown>;
type PersistedClaimNode = {
  kind: "claim";
  id: string;
  position: PersistedPosition;
  parentId?: string;
  data: LooseData;
  hidden?: boolean;
};
type PersistedGroupNode = {
  kind: "domainGroup";
  id: string;
  position: PersistedPosition;
  data: LooseData;
  style?: { width?: number; height?: number };
  hidden?: boolean;
};
type PersistedNode = PersistedClaimNode | PersistedGroupNode;
type PersistedEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data: LooseData;
  hidden?: boolean;
};
type Persisted = {
  schemaVersion: number;
  seedHash: string;
  nodes: PersistedNode[];
  edges: PersistedEdge[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPosition = (v: unknown): v is PersistedPosition =>
  isRecord(v) && Number.isFinite(v.x) && Number.isFinite(v.y);
const optionalString = (v: unknown) => v === undefined || typeof v === "string";
const optionalBoolean = (v: unknown) =>
  v === undefined || typeof v === "boolean";
const optionalNumber = (v: unknown) => v === undefined || typeof v === "number";

function isPersistedNode(v: unknown): v is PersistedNode {
  if (
    !isRecord(v) ||
    typeof v.id !== "string" ||
    !isPosition(v.position) ||
    !isRecord(v.data) ||
    !optionalBoolean(v.hidden)
  ) {
    return false;
  }
  if (v.kind === "claim") return optionalString(v.parentId);
  if (v.kind === "domainGroup") {
    if (v.style === undefined) return true;
    return (
      isRecord(v.style) &&
      optionalNumber(v.style.width) &&
      optionalNumber(v.style.height)
    );
  }
  return false;
}

function isPersistedEdge(v: unknown): v is PersistedEdge {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.source === "string" &&
    typeof v.target === "string" &&
    optionalString(v.sourceHandle) &&
    optionalString(v.targetHandle) &&
    isRecord(v.data) &&
    optionalBoolean(v.hidden)
  );
}

function isPersisted(v: unknown): v is Persisted {
  return (
    isRecord(v) &&
    typeof v.schemaVersion === "number" &&
    typeof v.seedHash === "string" &&
    Array.isArray(v.nodes) &&
    v.nodes.every(isPersistedNode) &&
    Array.isArray(v.edges) &&
    v.edges.every(isPersistedEdge)
  );
}

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
 * What `loadPersisted` found. `empty` means there is nothing to act on (no
 * storage, or no stored sandbox); `unusable` means something is stored that the
 * caller cannot use and should drop with `clearPersisted`.
 */
export type LoadOutcome =
  | { status: "ok"; persisted: Persisted; seedDrift: boolean }
  | { status: "empty" }
  | { status: "unusable" };

/**
 * Read the persisted sandbox, validated. Pure: it reports what it found and
 * writes nothing, so a caller may run it during render. Dropping an unusable
 * snapshot and pruning the legacy keys are the caller's to do after commit
 * (`clearPersisted`, `pruneLegacyStoreKeys`).
 *
 * On success reports `seedDrift` — whether the stored seed differs from the
 * current canonical one — so the caller can offer a refresh without discarding
 * the user's edits.
 */
export function loadPersisted(expectedSeedHash: string): LoadOutcome {
  if (typeof window === "undefined") return { status: "empty" };

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORE_KEY);
  } catch {
    return { status: "empty" }; // storage unavailable; nothing to clear
  }
  if (!raw) return { status: "empty" };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { status: "unusable" };
  }

  // Corrupt, a pre-versioning payload, or a shape predating the current
  // schemaVersion — unusable either way. Drop and rebuild.
  if (!isPersisted(json)) return { status: "unusable" };
  if (json.schemaVersion !== STORE_SCHEMA_VERSION) {
    return { status: "unusable" };
  }
  return {
    status: "ok",
    persisted: json,
    seedDrift: json.seedHash !== expectedSeedHash,
  };
}

/**
 * Delete the pre-v3 store keys. Separate from `loadPersisted` because it
 * writes: the load runs during render to seed React Flow, and a render must
 * not mutate storage.
 */
export function pruneLegacyStoreKeys() {
  if (typeof window === "undefined") return;
  for (const k of LEGACY_STORE_KEYS) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* non-fatal */
    }
  }
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
