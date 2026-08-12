import { hydrateFromPersisted, type LoadOutcome } from "./persist";
import { isGroupNode, type ClaimEdge, type GraphNode } from "./types";

/**
 * What the canvas mounts with: the canonical graph built from `data/`, or the
 * user's persisted sandbox when there is a usable one.
 *
 * `seedDrift` reports that a restored sandbox predates the current `data/`
 * (claims added or removed since it was saved), which the chrome offers as a
 * refresh rather than acting on. `dropStored` asks the caller to delete what is
 * in storage; the deletion cannot happen here, because this runs during render.
 */
export type SeedResult = {
  nodes: GraphNode[];
  edges: ClaimEdge[];
  seedHash: string;
  seedDrift: boolean;
  dropStored: boolean;
};

/**
 * Choose between the canonical build and a stored sandbox.
 *
 * Pure, and takes the load outcome rather than reading storage itself, so the
 * decision is testable without a DOM. Every branch here has been a bug at some
 * point, which is the argument for it being reachable from a test at all.
 */
export function resolveSeed(
  canonical: { nodes: GraphNode[]; edges: ClaimEdge[] },
  seedHash: string,
  mode: "inline" | "fullbleed",
  loaded: LoadOutcome
): SeedResult {
  // Inline is a read-only display of canonical data/: it has no edit
  // affordances and nothing worth persisting. The persisted sandbox belongs to
  // fullbleed (/graph); reading it here put a visitor's editor state (other
  // domains, deleted seeds, collapsed groups) on the landing page, and let its
  // group chevrons write back to the shared key. Build fresh.
  if (mode === "inline") {
    return { ...canonical, seedHash, seedDrift: false, dropStored: false };
  }

  if (loaded.status === "ok") {
    try {
      const hydrated = hydrateFromPersisted(loaded.persisted);
      // Self-heal on schema drift: a fullbleed snapshot must contain at least
      // one domainGroup node. A snapshot predating a structural refactor (for
      // example before multi-domain landed) would rehydrate into an inert
      // graph, so drop it and rebuild. Load-bearing; see knowledge/issues.md.
      if (hydrated.nodes.some(isGroupNode)) {
        return {
          ...hydrated,
          seedHash,
          seedDrift: loaded.seedDrift,
          dropStored: false,
        };
      }
    } catch {
      // Validated by Zod and still unhydratable: belt and braces, since this
      // runs in render and a throw would white-screen the route. Fall through
      // and rebuild from canonical.
    }
  }

  // Nothing usable was stored. Only ask for a deletion when something is
  // actually there: `empty` means no storage at all, and clearing it would be
  // a write on every mount for no reason.
  return {
    ...canonical,
    seedHash,
    seedDrift: false,
    dropStored: loaded.status !== "empty",
  };
}
