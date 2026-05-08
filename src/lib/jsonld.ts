import type {
  Claim,
  ClaimGraph,
  Dossier,
  Edge,
  Forecast,
  Source,
} from "./types";

const CONTEXT = {
  schema: "https://schema.org/",
  aboard: "https://aboard.example/vocab/",
};

function sourceLD(s: Source) {
  return {
    "@type": "schema:CreativeWork",
    "schema:name": s.label,
    "schema:url": s.url,
    ...(s.excerpt ? { "schema:abstract": s.excerpt } : {}),
  };
}

export function claimLD(claim: Claim, base: string) {
  return {
    "@type": "schema:Claim",
    "@id": `${base}/claims/${claim.id}`,
    "schema:name": claim.title,
    "schema:text": claim.statement,
    "aboard:kind": claim.kind,
    "aboard:domain": claim.domain,
    "aboard:confidence": claim.confidence,
    "schema:citation": claim.sources.map(sourceLD),
    "schema:author": {
      "@type": "schema:SoftwareApplication",
      "schema:name": claim.authoredBy.agent,
      ...(claim.authoredBy.promptTitle
        ? { "aboard:promptTitle": claim.authoredBy.promptTitle }
        : {}),
      "schema:dateCreated": claim.authoredBy.generatedAt,
    },
  };
}

export function edgeLD(edge: Edge, base: string) {
  return {
    "@type": "aboard:CausalEdge",
    "@id": `${base}/edges/${edge.id}`,
    "aboard:from": { "@id": `${base}/claims/${edge.fromId}` },
    "aboard:to": { "@id": `${base}/claims/${edge.toId}` },
    "aboard:relation": edge.kind,
    "aboard:strength": edge.strength,
    ...(edge.rationale ? { "aboard:rationale": edge.rationale } : {}),
  };
}

export function forecastLD(forecast: Forecast, base: string) {
  return {
    "@type": "aboard:Forecast",
    "@id": `${base}/forecasts/${forecast.id}`,
    "aboard:attachedTo": { "@id": `${base}/claims/${forecast.attachedToClaimId}` },
    "schema:name": forecast.question,
    "aboard:resolutionDate": forecast.resolutionDate,
    "aboard:resolutionCriteria": forecast.resolutionCriteria,
    "aboard:predictions": forecast.predictions.map((p) => ({
      "@type": "aboard:Prediction",
      "aboard:probability": p.probability,
      "aboard:reasoning": p.reasoning,
      "schema:author": {
        "@type": "schema:SoftwareApplication",
        "schema:name": p.agent.agent,
        "schema:dateCreated": p.agent.generatedAt,
      },
    })),
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
      "schema:author": {
        "@type": "schema:SoftwareApplication",
        "schema:name": dossier.pro.authoredBy.agent,
      },
    },
    "aboard:con": {
      "@type": "aboard:Argument",
      "aboard:thesis": dossier.con.thesis,
      "schema:text": dossier.con.steelmannedSummary,
      "schema:citation": dossier.con.keySources.map(sourceLD),
      "schema:author": {
        "@type": "schema:SoftwareApplication",
        "schema:name": dossier.con.authoredBy.agent,
      },
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
  return {
    "@context": CONTEXT,
    "@type": "aboard:ClaimGraph",
    "@id": `${base}/graph`,
    "aboard:domain": graph.claims[0]?.domain ?? null,
    "aboard:claims": graph.claims.map((c) => claimLD(c, base)),
    "aboard:edges": graph.edges.map((e) => edgeLD(e, base)),
    "aboard:forecasts": graph.forecasts.map((f) => forecastLD(f, base)),
    "aboard:dossiers": graph.dossiers.map((d) => dossierLD(d, base)),
  };
}
