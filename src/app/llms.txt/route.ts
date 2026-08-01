import {
  getClaims,
  getDossierForClaim,
  getForecastsForClaim,
} from "@/lib/graph";
import { site } from "@/lib/content/loader";
import { siteBaseUrl } from "@/lib/site";

// Static-export to out/llms.txt at build time (output: "export").
export const dynamic = "force-static";

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
    `> ${site.agentIntro}`,
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
    `- API catalog (RFC 9727): ${base}/.well-known/api-catalog`,
    `- Per-claim Markdown twin: ${base}/claims/{id}/index.md`,
    `- Human + agent guide: ${base}/about`,
    "",
    "Markdown: send `Accept: text/markdown` to a page URL and it answers with",
    "that page's Markdown twin. Works on /, /about, /claims/{id}, and",
    "/dossiers/{id}.",
    "",
    "## MCP",
    "",
    `- Remote MCP server (streamable HTTP, stateless): POST ${base}/mcp`,
    `- Server card: ${base}/.well-known/mcp.json`,
    `- Protected resource metadata: ${base}/.well-known/oauth-protected-resource/mcp`,
    `- Authorization server metadata: ${base}/.well-known/oauth-authorization-server`,
    `- How to obtain a credential, in prose: ${base}/auth.md`,
    "",
    "Nine tools: list_claims, get_claim, get_graph, get_forecast, get_dossier,",
    "and the four propose_* write tools. Read tools need no credential and",
    "tools/list is open, so the write tools are visible before you authorize.",
    "Calling a propose_* tool without a credential returns 401 with a",
    "WWW-Authenticate header pointing at the metadata above: OAuth 2.1 with",
    "PKCE (S256), scope aboard:propose, GitHub sign-in behind it. A token",
    "lacking that scope gets 403 insufficient_scope. Static agent tokens",
    "issued by the operator still work. Protocol revisions 2026-07-28 and",
    "2025-11-25 are both served.",
    "",
    "If you reach this server through a gateway that settles authentication",
    `once per connection, use POST ${base}/mcp?auth=required, which raises the`,
    "challenge at the handshake rather than at the first write. Same endpoint,",
    "same audience, same scope; see /auth.md.",
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
    "never from the payload. Call the propose_* tools through the MCP endpoint",
    `above, or POST the same proposal to ${base}/api/proposals directly — they`,
    "are one write path with one set of rules. See /about for the detail.",
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
