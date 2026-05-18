/**
 * JSON-LD response shapes returned by the aboard API.
 *
 * These mirror `clients/briefing.ts` loosely. They describe only the fields
 * the read tools actually project or filter on — the full payload is passed
 * through to the caller verbatim, so we deliberately do not model every
 * nested field. AJV-style validation is out of scope here; the upstream API
 * already validates against `public/schema/v0.json` before serving.
 */

export type IriRef = { "@id": string };

export type ClaimLD = {
  "@type": "schema:Claim";
  "@id": string;
  "aboard:id": string;
  "schema:name": string;
  "schema:text": string;
  "aboard:kind": "symptom" | "mechanism" | "leverage_point";
  "aboard:domain": string;
  "aboard:confidence": number;
  // Other JSON-LD fields (citations, observations, author, …) pass through.
  [key: string]: unknown;
};

export type EdgeLD = {
  "@type": "aboard:CausalEdge";
  "@id": string;
  "aboard:id": string;
  "aboard:from": IriRef;
  "aboard:to": IriRef;
  [key: string]: unknown;
};

export type ForecastLD = {
  "@type": "aboard:Forecast";
  "@id": string;
  "aboard:id": string;
  "aboard:attachedTo": IriRef;
  [key: string]: unknown;
};

export type DossierLD = {
  "@type": "aboard:Dossier";
  "@id": string;
  "aboard:attachedTo": IriRef;
  [key: string]: unknown;
};

export type ClaimGraphLD = {
  "@type": "aboard:ClaimGraph";
  "@id": string;
  "aboard:domains": string[];
  "aboard:claims": ClaimLD[];
  "aboard:edges": EdgeLD[];
  "aboard:forecasts": ForecastLD[];
  "aboard:dossiers": DossierLD[];
  [key: string]: unknown;
};

export type FullClaimLD = ClaimLD & {
  "aboard:incomingEdges"?: EdgeLD[];
  "aboard:outgoingEdges"?: EdgeLD[];
  "aboard:forecasts"?: ForecastLD[];
  "aboard:dossier"?: DossierLD;
};

/** The compact projection `list_claims` returns. */
export type ClaimSummary = {
  id: string;
  kind: "symptom" | "mechanism" | "leverage_point";
  title: string;
  domain: string;
  confidence: number;
};

export function toClaimSummary(c: ClaimLD): ClaimSummary {
  return {
    id: c["aboard:id"],
    kind: c["aboard:kind"],
    title: c["schema:name"],
    domain: c["aboard:domain"],
    confidence: c["aboard:confidence"],
  };
}

/** Trailing path segment of an `@id` IRI, e.g. `…/forecasts/F4` → `F4`. */
export function shortId(iri: string): string {
  const segments = iri.split("/");
  return segments[segments.length - 1] || iri;
}
