import type { ClaimGraph } from "./types";

const ROW_BY_KIND = {
  symptom: 1,
  mechanism: 2,
  leverage_point: 3,
} as const;

const ENGINE_KIND = {
  symptom: "symptom",
  mechanism: "mechanism",
  leverage_point: "leverage",
} as const;

const SUPPORTED_EDGE_KINDS = new Set(["causes", "moderates", "reduces"]);

export function toEngineData(graph: ClaimGraph): EngineGraphData {
  const claimsByKind: Record<string, typeof graph.claims> = {
    symptom: [],
    mechanism: [],
    leverage_point: [],
  };
  for (const c of graph.claims) {
    claimsByKind[c.kind].push(c);
  }

  const dossierIds = new Set(graph.dossiers.map((d) => d.attachedToClaimId));
  const forecastCounts = new Map<string, number>();
  for (const f of graph.forecasts) {
    forecastCounts.set(
      f.attachedToClaimId,
      (forecastCounts.get(f.attachedToClaimId) ?? 0) + 1
    );
  }

  const nodes: EngineNode[] = [];
  for (const kind of ["symptom", "mechanism", "leverage_point"] as const) {
    const row = ROW_BY_KIND[kind];
    claimsByKind[kind].forEach((claim, col) => {
      const node: EngineNode = {
        id: claim.id,
        kind: ENGINE_KIND[kind],
        title: claim.title,
        body: claim.statement,
        meta: `confidence ${claim.confidence.toFixed(2)}`,
        conf: claim.confidence,
        author: claim.authoredBy.agent,
        filed: claim.createdAt.slice(0, 10),
        row,
        col,
      };
      const fc = forecastCounts.get(claim.id);
      if (fc) node.forecast = fc;
      if (dossierIds.has(claim.id)) node.dossier = true;
      nodes.push(node);
    });
  }

  const edges: EngineEdge[] = graph.edges
    .filter((e) => SUPPORTED_EDGE_KINDS.has(e.kind))
    .map((e) => ({
      from: e.fromId,
      to: e.toId,
      kind: e.kind as EngineEdge["kind"],
    }));

  return {
    domain: graph.claims[0]?.domain,
    nodes,
    edges,
  };
}
