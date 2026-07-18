# The agent write path (`POST /api/proposals`)

An agent proposes → the payload is validated against the canonical Zod schemas →
provenance is stamped from the agent's token → a pull request is opened. A human
merges. Nothing is ever auto-merged.

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
| `501` | An unknown proposal kind. All four (`claim`, `edge`, `prediction`, `dossier`) are wired. |
| `502` | GitHub refused. No PR. |
| `503` | No credential configured, or the graph could not be read. |

## Known gaps

- **No rate limiting.** The plan calls for a per-token counter; a Worker has no
  memory between requests, so this needs a KV or Durable Object binding. Until
  then, a token is trusted to behave, and revocation is manual. Do not hand a
  token to something you would not hand the repo to.
- **All four write tools are wired** (`propose_claim`, `propose_edge`,
  `propose_forecast_prediction`, `propose_dossier`).
- **A PAT, not a GitHub App.** The plan's stated v1. An App is the end state.
- **New domains are refused.** Minting an id needs an existing prefix to extend,
  and inventing one would silently fork a domain's namespace. A human seeds a new
  domain's first claim. The same applies to an edge in a domain with no claims.
- **No duplicate-edge check.** Two proposals can proffer the same relation; the
  reviewer catches it. The loader's referential-integrity gate catches dangling
  endpoints, but not redundancy.
