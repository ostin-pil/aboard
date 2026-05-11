import { getGraph } from "@/lib/data/loader";
import type { Claim, ClaimGraph, Dossier, Edge, Forecast } from "./types";

/**
 * Backwards-compatible `graph` export. Many call sites still reference this
 * as a top-level constant; resolving it via the loader keeps them working
 * while the data layer is filesystem-backed.
 */
export const graph: ClaimGraph = getGraph();

export function getClaims(): Claim[] {
  return graph.claims;
}

export function getClaim(id: string): Claim | undefined {
  return graph.claims.find((c) => c.id === id);
}

export function getEdges(): Edge[] {
  return graph.edges;
}

export function getEdgesForClaim(id: string): {
  incoming: Edge[];
  outgoing: Edge[];
} {
  return {
    incoming: graph.edges.filter((e) => e.toId === id),
    outgoing: graph.edges.filter((e) => e.fromId === id),
  };
}

export function getForecastsForClaim(id: string): Forecast[] {
  return graph.forecasts.filter((f) => f.attachedToClaimId === id);
}

export function getDossierForClaim(id: string): Dossier | undefined {
  return graph.dossiers.find((d) => d.attachedToClaimId === id);
}

export function getClaimsWithDossiers(): Claim[] {
  const ids = new Set(graph.dossiers.map((d) => d.attachedToClaimId));
  return graph.claims.filter((c) => ids.has(c.id));
}
