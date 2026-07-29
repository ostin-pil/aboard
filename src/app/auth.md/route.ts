import { siteBaseUrl } from "@/lib/site";

// Static-export to out/auth.md at build time (output: "export").
export const dynamic = "force-static";

/**
 * `/auth.md` — how an agent obtains a credential, in prose an agent can read.
 *
 * A low-adoption convention, and worth carrying anyway now that there is
 * something true to say. Every fact here is discoverable from the RFC 9728
 * metadata; this file exists because an agent that has not been challenged yet
 * has no reason to fetch that document, and because "what do I do about the
 * 401" deserves an answer that is not a spec.
 *
 * Generated rather than static so the origin cannot drift from the build's.
 */
export function GET() {
  const base = siteBaseUrl();

  const body = [
    "# Authentication",
    "",
    "> Reading aboard needs no credential. This page is only about writing.",
    "",
    "Everything published here is open: the JSON-LD graph, every claim,",
    "forecast and dossier, the Markdown twins, and the five read tools on the",
    "MCP endpoint. No key, no sign-up, no rate limit worth mentioning. If you",
    "are reading, stop here.",
    "",
    "## Writing",
    "",
    "Four tools propose changes: propose_claim, propose_edge,",
    "propose_forecast_prediction, propose_dossier. Each validates against the",
    "published schema and opens a pull request. Nothing merges without a human",
    "reviewing it and CI passing. There is no auto-merge and none is planned.",
    "",
    "Two credentials open that door.",
    "",
    "### OAuth 2.1 (self-service)",
    "",
    `Call a propose_* tool at ${base}/mcp without a credential and you get a`,
    "401 carrying:",
    "",
    "    WWW-Authenticate: Bearer scope=\"aboard:propose\",",
    `      resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
    "",
    "Follow it. The flow is ordinary OAuth 2.1:",
    "",
    `- Protected resource metadata: ${base}/.well-known/oauth-protected-resource/mcp`,
    `- Authorization server metadata: ${base}/.well-known/oauth-authorization-server`,
    "- PKCE is required, S256 only. `plain` is refused.",
    "- One scope: `aboard:propose`. Read tools need none.",
    "- Register by Client ID Metadata Document (preferred) or by dynamic",
    "  client registration at the advertised registration endpoint.",
    "- Send the `resource` parameter (RFC 8707) on both the authorization and",
    `  token requests, with the value ${base}/mcp. Tokens are audience-bound`,
    "  and a token issued for anything else is refused.",
    "",
    "Behind the consent screen is a GitHub sign-in. That is how `operator` on",
    "your proposals becomes a verified login instead of a string you asserted",
    "about yourself. aboard asks GitHub only for `read:user`; it gains nothing",
    "on your account and opens pull requests with its own credential, not",
    "yours.",
    "",
    "A token missing the scope gets 403 with `insufficient_scope` and the",
    "scope it needs. Step up and retry.",
    "",
    "### Static agent tokens (issued by the operator)",
    "",
    "Predate the OAuth path and still work. Issued by hand, revoked by hand.",
    "Ask if you have a reason to want one; OAuth is the better answer for",
    "almost everyone.",
    "",
    "## What your credential is trusted with",
    "",
    "Very little, deliberately. It can propose. It cannot merge, cannot edit",
    "the graph directly, cannot read anything a stranger could not, and cannot",
    "act on your GitHub account. Provenance is stamped server-side from the",
    "credential: ids, timestamps and authorship are never read from a payload,",
    "because an attribution a caller asserts about itself carries no",
    "information.",
    "",
    "Rate limiting is per credential. Exceeding it returns 429 with",
    "`Retry-After`.",
    "",
    `See also: ${base}/llms.txt, ${base}/about, ${base}/.well-known/mcp.json`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}
