import { DOSSIER_GLOSS, LAYERS_GLOSS, NON_CONVERGENT, POSITIONING } from "@/lib/copy";
import { getClaims, getDossierForClaim, getForecastsForClaim, graph } from "@/lib/graph";
import { siteBaseUrl } from "@/lib/site";

// Static-export to out/index.md at build time (output: "export").
export const dynamic = "force-static";

/**
 * `/index.md` — the Markdown twin of the homepage, and what an agent gets when
 * it asks `/` for `text/markdown` (the Worker negotiates; see
 * `src/lib/markdown-negotiation.ts`).
 *
 * The homepage is a hero paragraph over an interactive canvas, so the twin
 * carries the prose and turns the canvas into what an agent can actually use: a
 * per-domain index into the claim twins. Every count is derived from the graph,
 * so this cannot drift from `data/` the way hardcoded copy did.
 */
export function GET() {
  const base = siteBaseUrl();
  const claims = getClaims();

  const counts = {
    symptoms: claims.filter((c) => c.kind === "symptom").length,
    mechanisms: claims.filter((c) => c.kind === "mechanism").length,
    leverage: claims.filter((c) => c.kind === "leverage_point").length,
  };

  const byDomain = new Map<string, typeof claims>();
  for (const c of claims) {
    byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c]);
  }

  const lines: string[] = [
    "# aboard",
    "",
    `> ${POSITIONING}`,
    "",
    `HTML: ${base}/ · JSON-LD: ${base}/api/graph · Agent index: ${base}/llms.txt`,
    "",
    "## What is here",
    "",
    `${LAYERS_GLOSS} Claims carry visible model and prompt provenance, and dossiers ` +
      `are ${NON_CONVERGENT}: ${DOSSIER_GLOSS}.`,
    "",
    `- ${claims.length} claims across ${byDomain.size} domains ` +
      `(${counts.symptoms} symptoms, ${counts.mechanisms} mechanisms, ${counts.leverage} leverage points)`,
    `- ${graph.forecasts.length} forecasts, ${graph.edges.length} causal edges, ${graph.dossiers.length} dossiers`,
    "",
    "## Machine-readable surface",
    "",
    `- Full graph as JSON-LD: ${base}/api/graph`,
    `- Single claim with its edges, forecasts and dossier: ${base}/api/claims/{id}`,
    `- JSON Schema (authoritative): ${base}/schema/v0.json`,
    `- API catalog (RFC 9727): ${base}/.well-known/api-catalog`,
    `- Agent index of every claim: ${base}/llms.txt`,
    "",
    "Any page with a Markdown twin also answers its own URL in Markdown when you",
    "send `Accept: text/markdown`.",
    "",
    "## Claims by domain",
  ];

  for (const [domain, list] of byDomain) {
    lines.push("", `### ${domain}`, "");
    for (const c of list) {
      const notes: string[] = [];
      const forecasts = getForecastsForClaim(c.id);
      if (forecasts.length > 0) notes.push(`forecast ${forecasts.map((f) => f.id).join(", ")}`);
      if (getDossierForClaim(c.id)) notes.push("dossier");
      const suffix = notes.length > 0 ? ` — ${notes.join("; ")}` : "";
      lines.push(`- [${c.id}: ${c.title}](${base}/claims/${c.id}/index.md) (${c.kind})${suffix}`);
    }
  }

  lines.push(
    "",
    "## Contributing (agents)",
    "",
    "The write path is live and gated: propose a claim, causal edge, forecast",
    "prediction, or dual-dossier and it opens a pull request for human review.",
    "Provenance is stamped from your credential, never from the payload. The",
    `contract is at ${base}/about.`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
