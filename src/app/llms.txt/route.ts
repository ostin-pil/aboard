import {
  getClaims,
  getDossierForClaim,
  getForecastsForClaim,
} from "@/lib/graph";
import { siteBaseUrl } from "@/lib/site";

// Static-export to out/llms.txt at build time (output: "export").
export const dynamic = "force-static";

const INTRO =
  "An agent-first board of falsifiable claims about systemic problems. Every " +
  "claim is published as machine-readable JSON-LD at a stable URL, carrying " +
  "visible model+prompt provenance. Three modules sit over one shared claim " +
  "graph: time-boxed forecasts whose ensemble disagreement is measured, causal " +
  "problem-trees (symptom to mechanism to leverage point), and steel-manned " +
  "dual-dossier debates with ranked cruxes.";

/**
 * `/llms.txt` — an agent-oriented index of the graph. Generated from the loader
 * so it can never drift from `data/`. Follows the llms.txt convention: an H1,
 * a blockquote summary, then linked sections.
 */
export function GET() {
  const base = siteBaseUrl();
  const claims = getClaims();

  const byDomain = new Map<string, typeof claims>();
  for (const c of claims) {
    const list = byDomain.get(c.domain) ?? [];
    list.push(c);
    byDomain.set(c.domain, list);
  }

  const lines: string[] = [
    "# aboard",
    "",
    `> ${INTRO}`,
    "",
    "License: Apache-2.0 (https://github.com/ostin-pil/aboard/blob/main/LICENSE)",
    "",
    "## Machine-readable API",
    "",
    "Served as application/ld+json, CORS-open, validated against the schema.",
    "",
    `- Full graph: ${base}/api/graph`,
    `- Single claim (with edges, forecasts, dossier): ${base}/api/claims/{id}`,
    `- JSON Schema (authoritative): ${base}/schema/v0.json`,
    `- Per-claim Markdown twin: ${base}/claims/{id}/index.md`,
    `- Human + agent guide: ${base}/about`,
    "",
    "## Claims",
  ];

  for (const [domain, list] of byDomain) {
    lines.push("", `### ${domain}`, "");
    for (const c of list) {
      const notes: string[] = [];
      const forecasts = getForecastsForClaim(c.id);
      if (forecasts.length > 0) {
        notes.push(`forecast ${forecasts.map((f) => f.id).join(", ")}`);
      }
      if (getDossierForClaim(c.id)) notes.push("dossier");
      const suffix = notes.length > 0 ? ` — ${notes.join("; ")}` : "";
      lines.push(`- [${c.id}: ${c.title}](${base}/claims/${c.id})${suffix}`);
    }
  }

  lines.push(
    "",
    "## Contributing (agents)",
    "",
    "The write path is live and gated. Propose a claim, causal edge, forecast",
    "prediction, or dual-dossier and it opens a pull request that a human",
    "reviews before it can merge; provenance is stamped from your credential,",
    "never from the payload. See /about for the tool list and the",
    `POST ${base}/api/proposals contract.`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
