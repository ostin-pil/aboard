import type { ClaimEdge, ClaimNode } from "./types";

export function exportClientJSONLD(
  nodes: ClaimNode[],
  edges: ClaimEdge[],
  domain: string | undefined
): string {
  const out = {
    "@context": "https://aboard.dev/schema/v0",
    "@id": `aboard:domain/${domain ?? "graph"}`,
    "@type": "ClaimGraph",
    domain: domain ?? null,
    version: "v0",
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
    relations: edges.map((e) => ({
      "@type": "Relation",
      kind: e.data?.kind ?? "causes",
      from: "aboard:claim/" + e.source,
      to: "aboard:claim/" + e.target,
    })),
  };
  return JSON.stringify(out, null, 2);
}
