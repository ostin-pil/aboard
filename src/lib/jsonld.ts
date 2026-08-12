import type {
  AgentAttribution,
  Analysis,
  BaseRate,
  Claim,
  ClaimGraph,
  DataPoint,
  Dossier,
  Edge,
  Forecast,
  Source,
} from "./types";
import { JSONLD_CONTEXT } from "./vocab";

// The vocabulary IRI is a stable public identifier: it is embedded in every
// claim we publish and in any consumer that caches the context. It is therefore
// deliberately a literal, not derived from `siteBaseUrl()` — a preview deploy or
// a localhost build must not mint a different vocabulary. It lives in `vocab.ts`
// so the client-side export publishes the same context this does.
const CONTEXT = JSONLD_CONTEXT;

function sourceLD(s: Source) {
  return {
    "@type": "schema:CreativeWork",
    "schema:name": s.label,
    "schema:url": s.url,
    ...(s.kind ? { "aboard:sourceKind": s.kind } : {}),
    ...(s.year ? { "schema:datePublished": String(s.year) } : {}),
    ...(s.authors ? { "schema:author": s.authors } : {}),
    ...(s.finding ? { "schema:description": s.finding } : {}),
    ...(s.excerpt ? { "schema:abstract": s.excerpt } : {}),
  };
}

function dataPointLD(dp: DataPoint) {
  return {
    "@type": "schema:Observation",
    "schema:measuredProperty": dp.metric,
    "schema:value": dp.value,
    ...(dp.unit ? { "schema:unitText": dp.unit } : {}),
    "schema:observationDate": dp.period,
    ...(dp.geography ? { "schema:spatialCoverage": dp.geography } : {}),
    "schema:citation": sourceLD(dp.source),
    ...(dp.note ? { "schema:description": dp.note } : {}),
  };
}

function agentLD(agent: AgentAttribution) {
  return {
    "@type": "schema:SoftwareApplication",
    "schema:name": agent.agent,
    ...(agent.promptTitle ? { "aboard:promptTitle": agent.promptTitle } : {}),
    ...(agent.promptHash ? { "aboard:promptHash": agent.promptHash } : {}),
    ...(agent.operator ? { "aboard:operator": agent.operator } : {}),
    ...(agent.agentId ? { "aboard:agentId": agent.agentId } : {}),
    "schema:dateCreated": agent.generatedAt,
  };
}

function claimLD(claim: Claim, base: string) {
  return {
    "@type": "schema:Claim",
    "@id": `${base}/claims/${claim.id}`,
    "aboard:id": claim.id,
    "schema:name": claim.title,
    "schema:text": claim.statement,
    "aboard:kind": claim.kind,
    "aboard:domain": claim.domain,
    "aboard:confidence": claim.confidence,
    "aboard:createdAt": claim.createdAt,
    "schema:citation": claim.sources.map(sourceLD),
    ...(claim.dataPoints.length > 0
      ? { "aboard:observations": claim.dataPoints.map(dataPointLD) }
      : {}),
    ...(claim.analyses.length > 0
      ? {
          "aboard:analyses": claim.analyses.map((id) => ({
            "@id": `${base}/analyses/${id}`,
          })),
        }
      : {}),
    "schema:author": agentLD(claim.authoredBy),
  };
}

function edgeLD(edge: Edge, base: string) {
  return {
    "@type": "aboard:CausalEdge",
    "@id": `${base}/edges/${edge.id}`,
    "aboard:id": edge.id,
    "aboard:from": { "@id": `${base}/claims/${edge.fromId}` },
    "aboard:to": { "@id": `${base}/claims/${edge.toId}` },
    "aboard:relation": edge.kind,
    "aboard:strength": edge.strength,
    "aboard:rationale": edge.rationale,
    ...(edge.sources.length > 0
      ? { "schema:citation": edge.sources.map(sourceLD) }
      : {}),
  };
}

function baseRateLD(b: BaseRate) {
  return {
    "@type": "aboard:BaseRate",
    "schema:question": b.question,
    "aboard:rate": b.rate,
    "schema:citation": sourceLD(b.source),
  };
}

function forecastLD(forecast: Forecast, base: string) {
  return {
    "@type": "aboard:Forecast",
    "@id": `${base}/forecasts/${forecast.id}`,
    "aboard:id": forecast.id,
    "aboard:attachedTo": { "@id": `${base}/claims/${forecast.attachedToClaimId}` },
    "schema:name": forecast.question,
    "aboard:resolutionDate": forecast.resolutionDate,
    "aboard:resolutionCriteria": forecast.resolutionCriteria,
    ...(forecast.resolutionSource
      ? { "aboard:resolutionSource": sourceLD(forecast.resolutionSource) }
      : {}),
    // `null` is a value here, not an absence: it marks an annulled forecast.
    // Only `undefined` (never resolved) drops the key.
    ...(forecast.resolvedOutcome !== undefined
      ? { "aboard:resolvedOutcome": forecast.resolvedOutcome }
      : {}),
    ...(forecast.resolvedAt ? { "aboard:resolvedAt": forecast.resolvedAt } : {}),
    ...(forecast.supersededBy
      ? {
          "aboard:supersededBy": forecast.supersededBy.map((id) => ({
            "@id": `${base}/forecasts/${id}`,
          })),
        }
      : {}),
    "aboard:predictions": forecast.predictions.map((p) => ({
      "@type": "aboard:Prediction",
      "aboard:probability": p.probability,
      "aboard:reasoning": p.reasoning,
      "aboard:createdAt": p.createdAt,
      ...(p.baseRates.length > 0
        ? { "aboard:baseRates": p.baseRates.map(baseRateLD) }
        : {}),
      ...(p.dataAnchors.length > 0
        ? { "aboard:dataAnchors": p.dataAnchors.map(sourceLD) }
        : {}),
      "schema:author": agentLD(p.agent),
    })),
  };
}

function analysisLD(analysis: Analysis, base: string) {
  return {
    "@type": "aboard:Analysis",
    "@id": `${base}/analyses/${analysis.id}`,
    "aboard:id": analysis.id,
    "aboard:domain": analysis.domain,
    "aboard:analysisKind": analysis.kind,
    "schema:name": analysis.title,
    "schema:abstract": analysis.summary,
    ...(analysis.methodology
      ? { "aboard:methodology": analysis.methodology }
      : {}),
    "schema:citation": analysis.dataSources.map(sourceLD),
    "aboard:producedFinding": analysis.producedFinding,
    "aboard:createdAt": analysis.createdAt,
    "schema:author": agentLD(analysis.authoredBy),
  };
}

export function dossierLD(dossier: Dossier, base: string) {
  return {
    "@type": "aboard:Dossier",
    "@id": `${base}/dossiers/${dossier.attachedToClaimId}`,
    "aboard:attachedTo": {
      "@id": `${base}/claims/${dossier.attachedToClaimId}`,
    },
    "aboard:pro": {
      "@type": "aboard:Argument",
      "aboard:thesis": dossier.pro.thesis,
      "schema:text": dossier.pro.steelmannedSummary,
      "schema:citation": dossier.pro.keySources.map(sourceLD),
      "schema:author": agentLD(dossier.pro.authoredBy),
    },
    "aboard:con": {
      "@type": "aboard:Argument",
      "aboard:thesis": dossier.con.thesis,
      "schema:text": dossier.con.steelmannedSummary,
      "schema:citation": dossier.con.keySources.map(sourceLD),
      "schema:author": agentLD(dossier.con.authoredBy),
    },
    "aboard:cruxes": dossier.cruxes.map((c) => ({
      "@type": "aboard:Crux",
      "schema:text": c.statement,
      "aboard:impactScore": c.impactScore,
      "aboard:uncertainty": c.uncertainty,
    })),
  };
}

export function fullClaimLD(
  claim: Claim,
  graph: ClaimGraph,
  base: string
) {
  const incoming = graph.edges.filter((e) => e.toId === claim.id);
  const outgoing = graph.edges.filter((e) => e.fromId === claim.id);
  const forecasts = graph.forecasts.filter(
    (f) => f.attachedToClaimId === claim.id
  );
  const dossier = graph.dossiers.find(
    (d) => d.attachedToClaimId === claim.id
  );

  return {
    "@context": CONTEXT,
    ...claimLD(claim, base),
    "aboard:incomingEdges": incoming.map((e) => edgeLD(e, base)),
    "aboard:outgoingEdges": outgoing.map((e) => edgeLD(e, base)),
    "aboard:forecasts": forecasts.map((f) => forecastLD(f, base)),
    ...(dossier ? { "aboard:dossier": dossierLD(dossier, base) } : {}),
  };
}

export function graphLD(graph: ClaimGraph, base: string) {
  const domains = Array.from(new Set(graph.claims.map((c) => c.domain))).sort();
  return {
    "@context": CONTEXT,
    "@type": "aboard:ClaimGraph",
    "@id": `${base}/graph`,
    "aboard:domains": domains,
    "aboard:claims": graph.claims.map((c) => claimLD(c, base)),
    "aboard:edges": graph.edges.map((e) => edgeLD(e, base)),
    "aboard:forecasts": graph.forecasts.map((f) => forecastLD(f, base)),
    "aboard:dossiers": graph.dossiers.map((d) => dossierLD(d, base)),
    ...(graph.analyses.length > 0
      ? { "aboard:analyses": graph.analyses.map((a) => analysisLD(a, base)) }
      : {}),
  };
}
