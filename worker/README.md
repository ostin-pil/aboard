# The agent endpoints (`POST /api/proposals`, `POST /mcp`)

An agent proposes → the payload is validated against the canonical Zod schemas →
provenance is stamped from the agent's token → a pull request is opened. A human
merges. Nothing is ever auto-merged.

Two doors onto that one room. `POST /api/proposals` takes a proposal envelope
over plain HTTP. `POST /mcp` is the remote MCP server, whose four `propose_*`
tools call the same `runProposal` internals — the same auth, the same rate
limit, the same validation, the same PR. Everything below about the trust
posture and configuration governs both. The MCP endpoint's own contract is in
[the MCP section](#the-mcp-endpoint-post-mcp).

## Why this is a Worker and not a Next route

aboard is a static export (`output: "export"`). Next's own docs are explicit:
under static export, Route Handlers support **`GET` only**, and handlers that
rely on `Request` are unsupported. There is no server runtime, so `POST
/api/proposals` cannot be a Next route.

The Cloudflare Worker that already fronts the static assets handles it instead.
Same origin, same deploy, and the GitHub credential never leaves the server.
Every path other than `/api/proposals` falls straight through to the assets
binding, so the static site is untouched.

The Worker is a thin shell: HTTP, token lookup, GitHub calls. Every decision that
matters — what a valid proposal is, which id gets minted, what the committed file
looks like — lives in `src/lib/proposals.ts` and `src/lib/data/serialize.ts`,
which are pure and unit-tested. It imports the canonical Zod schemas from
`src/lib/types.ts`, so there is exactly one definition of what aboard's data is.

## Trust posture

From `research/integrity-anti-gaming.md`: zero-trust by default, human review as
the admission gate.

**The caller supplies content. It does not supply identity, ids, or timestamps.**
Those are stamped server-side from the token the request authenticated with. An
attribution a caller can assert about itself carries no information, which is why
`operator` and `agentId` are never read from the payload.

A proposal that would break the graph cannot be merged even by mistake: CI runs
the build, the referential-integrity checks, and the test suite on every PR.

## Configuration

The endpoint is **inert until two secrets exist**. With neither set it answers
`503 not_configured`, and the rest of the site is unaffected — so deploying this
Worker before configuring it is safe.

```bash
# 1. A fine-grained GitHub PAT. Scope it as narrowly as it goes:
#    repository: ostin-pil/aboard only
#    permissions: Contents (read+write), Pull requests (read+write)
#    Nothing else. It cannot merge, and it must not be able to.
wrangler secret put GITHUB_TOKEN

# 2. The agent token table: a JSON map from secret token to the provenance
#    stamped into anything filed with it.
wrangler secret put ABOARD_AGENT_TOKENS
```

`ABOARD_AGENT_TOKENS` takes the shape:

```json
{
  "<a-long-random-secret>": {
    "tokenId": "claude-costa",
    "operator": "ostin-pil",
    "agent": "claude-opus-4-8",
    "agentId": "a1b2c3d4e5f60718"
  }
}
```

`tokenId` appears in the branch name. `operator`, `agent`, and `agentId` are
written into the claim's `authoredBy`. Issue and rotate by editing this map —
manual is the right scale for now, and revocation is deleting a line.

`GITHUB_REPO` and `GITHUB_BASE_BRANCH` are plain vars in `wrangler.jsonc`.

## Calling it

```bash
curl -X POST https://aboard.untype.me/api/proposals \
  -H "authorization: Bearer $ABOARD_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{
        "kind": "claim",
        "rationale": "Why this claim belongs in the graph.",
        "payload": {
          "domain": "inequality",
          "kind": "mechanism",
          "title": "…",
          "statement": "…",
          "confidence": 0.6,
          "sources": [{ "label": "…", "url": "https://…", "kind": "paper" }]
        }
      }'
```

An `edge` proposal names two existing claims and the relation; the endpoint picks
the target file (a domain's `edges.yaml`, or `cross_domain_edges.yaml` when the
endpoints span domains) and mints the id:

```bash
curl -X POST https://aboard.untype.me/api/proposals \
  -H "authorization: Bearer $ABOARD_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{
        "kind": "edge",
        "rationale": "What makes this relation hold.",
        "payload": {
          "from": "IM1", "to": "IS3",
          "kind": "causes", "strength": 0.6,
          "sources": [{ "label": "…", "url": "https://…", "kind": "paper" }]
        }
      }'
```

Through MCP, the same calls are `propose_claim` and `propose_edge`; set
`ABOARD_AGENT_TOKEN` and `ABOARD_API_BASE_URL` in the server's environment.

### Responses

| Status | Meaning |
| --- | --- |
| `201` | PR opened. Body carries `kind`, `id`, `path`, `branch`, `pullRequest`. |
| `401` | Missing or unknown bearer token. Nothing written. |
| `422` | Validation failed. Body carries `issues[]` with the exact field paths — an agent can fix and retry without guessing. |
| `429` | Too many proposals from this credential in the current window. Body carries `retryAfterSeconds`; a `Retry-After` header repeats it. Nothing written. |
| `501` | An unknown proposal kind. All four (`claim`, `edge`, `prediction`, `dossier`) are wired. |
| `502` | GitHub refused. No PR. |
| `503` | No credential configured, or the graph could not be read. |

## Rate limiting

A flood brake sits in front of the GitHub work, keyed per credential
(`proposal:<tokenId>`), so one leaked or runaway token cannot open an unbounded
burst of PRs. It uses the native Workers Rate Limiting binding
(`PROPOSAL_LIMITER` in `wrangler.jsonc`) — no namespace to provision, and
`wrangler deploy` is all it takes. Over the limit returns `429` with a
`Retry-After` header; the check runs after auth, so an unauthenticated caller
still gets `401`.

It **fails open**: if the binding is absent or errors, proposals are allowed.
The limiter is defense-in-depth ahead of a human-gated queue, not the admission
gate, so a limiter hiccup must never reject a legitimate proposal.

Two honest bounds, both from the binding's design (`src/lib/rate-limit.ts` has
the detail): the window is a per-minute burst cap, not a per-hour/day quota (the
binding's `period` is restricted to 10 or 60 seconds — a longer quota would need
KV or a Durable Object), and it is per-Cloudflare-location and eventually
consistent, so the effective cap is approximate. That is the right shape for
capping blast radius; it is not exact accounting.

## The MCP endpoint (`POST /mcp`)

A remote [Model Context Protocol](https://modelcontextprotocol.io) server, so
any client — Claude, ChatGPT, an IDE — can connect to aboard without installing
the stdio package in `mcp-server/`. Nine tools: the five read projections of the
published JSON-LD, and the four `propose_*` tools, which route through
`runProposal` exactly as `/api/proposals` does.

Read tools are public. Write tools need the same `Authorization: Bearer` token
as the write path, and answer `401` without one.

**Stateless, and dual-era.** MCP revision `2026-07-28` removes the `initialize`
handshake and the protocol-level session; `2025-11-25` and earlier require them.
The endpoint serves both, selecting on how the client opens: an `initialize`
request gets legacy semantics, and a request carrying
`_meta.io.modelcontextprotocol/protocolVersion` (or a modern
`MCP-Protocol-Version` header) is served as modern. That costs almost nothing
here — a stateless server never used the session the new revision removed, and
never needs the multi-round-trip input the new revision added — and it means the
endpoint works with every client shipping today and with the ones that follow.

In the modern era the mirrored headers are validated against the body:
`MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` on a `tools/call` must all
be present and must agree, or the request is refused with `400` and JSON-RPC
code `-32020`. A version we do not implement is `-32022` with the supported list
attached. Legacy requests carry none of these and are not held to them.

`GET` and `DELETE` answer `405`: there is no SSE stream to open and no session to
delete. An `Origin` header that is neither ours nor loopback is refused with
`403`, per the transport's DNS-rebinding rule; agent clients send none.

Smoke-test it against the local runtime:

```bash
npm run build && npx wrangler dev
curl -sS localhost:8787/mcp -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -40
```

Discovery: the server card is a static file, served at
`/.well-known/mcp.json` (the registry's `server.schema.json` shape) and
mirrored at `/.well-known/mcp/server-card.json`.

## Known gaps

- **The MCP endpoint is bearer-auth only.** OAuth 2.1 + PKCE is where the
  industry is going and where a public multi-tenant server has to end up; static
  tokens match the shipped write path and are the honest v1.
- **Revocation is manual.** A token is trusted to behave within its rate; to
  revoke, delete its line from `ABOARD_AGENT_TOKENS`. Do not hand a token to
  something you would not hand the repo to.
- **All four write tools are wired** (`propose_claim`, `propose_edge`,
  `propose_forecast_prediction`, `propose_dossier`).
- **A PAT, not a GitHub App.** The plan's stated v1. An App is the end state.
- **New domains are refused.** Minting an id needs an existing prefix to extend,
  and inventing one would silently fork a domain's namespace. A human seeds a new
  domain's first claim. The same applies to an edge in a domain with no claims.
- **No duplicate-edge check.** Two proposals can proffer the same relation; the
  reviewer catches it. The loader's referential-integrity gate catches dangling
  endpoints, but not redundancy.
