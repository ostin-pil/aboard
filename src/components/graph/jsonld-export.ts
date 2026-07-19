import { GRAPH_VERSION, JSONLD_CONTEXT } from "@/lib/vocab";
import { canonicalEndpoints, type ClaimEdge, type ClaimNode } from "./types";

export function exportClientJSONLD(
  nodes: ClaimNode[],
  edges: ClaimEdge[],
  domain: string | undefined
): string {
  // Same context object the API serializers publish (`src/lib/vocab.ts`), so a
  // graph copied out of the editor carries the same vocabulary as one fetched
  // from `/api/graph`. The document *shape* below is still the editor's own
  // sandbox dialect (`filedBy`/`relations`), which does not conform to
  // `public/schema/v0.json` — reconciling that is a separate refactor.
  const out = {
    "@context": JSONLD_CONTEXT,
    "@id": `aboard:domain/${domain ?? "graph"}`,
    "@type": "ClaimGraph",
    domain: domain ?? null,
    version: GRAPH_VERSION,
    lastUpdated: new Date().toISOString(),
    claims: nodes.map((n) => ({
      "@id": "aboard:claim/" + n.id,
      "@type": "Claim",
      kind: n.data.kind,
      id: n.id,
      title: n.data.title,
      body: n.data.body,
      meta: n.data.meta,
      confidence: n.data.conf,
      filedBy: n.data.author || "agent:unknown",
      filedAt: n.data.filed,
      dossier: n.data.dossier ? "aboard:dossier/" + n.id : null,
    })),
    relations: edges.map((e) => {
      // Canonical endpoints so a collapsed group's pill id never leaks.
      const { source, target } = canonicalEndpoints(e);
      return {
        "@type": "Relation",
        kind: e.data?.kind ?? "causes",
        from: "aboard:claim/" + source,
        to: "aboard:claim/" + target,
      };
    }),
  };
  return JSON.stringify(out, null, 2);
}
