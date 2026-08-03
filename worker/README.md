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

### OAuth (optional, and separately inert)

The MCP endpoint also accepts tokens from aboard's own authorization server, so
a client that has never been handed a static token can obtain one by signing in
with GitHub. This half is inert until its own configuration exists: with no
`OAUTH_KV` binding, `/oauth/*` answers `503`, no OAuth discovery is advertised
on a `401`, and static tokens behave exactly as they always have.

```bash
# 1. Storage for clients, codes, grants and tokens. Paste the printed id into
#    the kv_namespaces block in wrangler.jsonc. Done for this account; a fresh
#    account needs it again, and a new namespace revokes every existing token.
npx wrangler kv namespace create ABOARD_OAUTH

# 2. A GitHub OAuth App (Settings > Developer settings > OAuth Apps).
#    Authorization callback URL: https://aboard.untype.me/oauth/callback
#    It needs no repository permissions: read:user is the whole ask.
wrangler secret put GITHUB_OAUTH_CLIENT_ID
wrangler secret put GITHUB_OAUTH_CLIENT_SECRET

# 3. A random HMAC key sealing the in-flight authorization state.
#    openssl rand -hex 32
wrangler secret put ABOARD_OAUTH_STATE_SECRET

# 4. Optional. Comma-separated GitHub logins allowed to obtain a credential.
#    Unset or empty means any authenticated GitHub account may.
wrangler secret put ABOARD_OAUTH_ALLOWED_LOGINS
```

The GitHub OAuth App is production-only: GitHub allows one callback URL, and
the Worker derives it from `CANONICAL_ORIGIN`. Driving the flow against
`wrangler dev` needs a second App with a loopback callback and that constant
pointed at the dev origin. Device Flow stays disabled on the App; the code uses
the authorization-code flow and never calls the device endpoints.

**Who may obtain a credential.** The allowlist defaults to open, decided in
session 31. Human review of every pull request is already the admission gate,
and `plans/mcp-write-path.md` records it as the only Sybil defense with a long
track record. Setting `ABOARD_OAUTH_ALLOWED_LOGINS` narrows it to named logins
without a redeploy of anything but the secret. The check runs at consent and
again at issuance, so tightening it closes pages that are already open.

**The GitHub login is identity, not authority.** Pull requests are still opened
by aboard's own PAT. Signing in with GitHub establishes who is asking, so that
`operator` on every proposal is a verified login rather than a string a human
typed into a table. It grants aboard nothing on the user's account: `read:user`
is the only scope requested, and no repository permission is involved.

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
`runProposal` exactly as `/api/proposals` does. The same published JSON-LD is
also served as MCP resources (below).

Read tools are public and stay that way. Write tools need a credential, either
a static agent token or an OAuth access token carrying `aboard:propose`.

**The endpoint is half public, so the challenge is per call.** `tools/list`
answers everyone and lists all nine tools, because a client that cannot see the
write tools has no reason to authenticate. Calling a `propose_*` tool without a
credential is what draws the challenge:

| Caller | Read tool | Write tool |
| --- | --- | --- |
| No credential | `200` | `401` with `WWW-Authenticate` |
| Static agent token | `200` | `201` |
| OAuth token, `aboard:propose` | `200` | `201` |
| OAuth token without the scope | `200` | `403` `insufficient_scope` |
| Invalid or expired token | `200` | `401` with `WWW-Authenticate` |

A missing credential is a transport-level answer rather than a tool result: it
is the client, not the model, that has to act on it, and a `401` carrying
`WWW-Authenticate` is what starts an OAuth flow. Validation failures stay tool
errors with the field paths attached, which is what a model can act on.

The challenge points at RFC 9728 Protected Resource Metadata, served at
`/.well-known/oauth-protected-resource/mcp` (path-aware, per §3.1) and at the
root as the fallback clients try second. Authorization server metadata is at
`/.well-known/oauth-authorization-server`.

**`?auth=required` moves the challenge to the handshake.** Some gateways decide
whether a connection needs authentication once, when the connection is created,
and never revisit it. Against the table above such a client succeeds: it calls
`initialize`, reads answer `200`, the connection is recorded as needing nothing,
and no authorization flow ever runs. The `401` a write raises later arrives long
after the only moment that client would have acted on it, so its writes can
never succeed. Smithery's Connect API behaves this way, and session 35 confirmed
it against the Worker's own logs: discovery fetched the metadata document, the
handshake answered `200`, and no client was ever registered.

Adding `?auth=required` challenges an uncredentialed caller before the body is
read, so the handshake itself carries `WWW-Authenticate` and such a client
discovers the authorization server, registers, and completes a flow. Everything
else is unchanged: same endpoint, same metadata document, same token audience,
same `aboard:propose` scope. It changes when the challenge is raised, not what a
token is good for. Point a gateway at
`https://aboard.untype.me/mcp?auth=required`; leave every ordinary client on the
plain URL, where reads stay public.

**Resources: the same JSON-LD, addressed the way a host expects.** Alongside
the nine tools the endpoint declares the `resources` capability and serves
`resources/list`, `resources/templates/list` and `resources/read`. Tools are
model-driven actions; resources are application-driven context a host can list,
pick and read without the model having to ask. `get_graph` and `get_claim` stay
where they are, and the same two documents are now addressable directly:

| | URI | Notes |
| --- | --- | --- |
| Resource | `https://aboard.untype.me/api/graph` | The whole graph |
| Template | `https://aboard.untype.me/api/claims/{id}` | One claim; `list_claims` discovers the ids |

The URIs are `https://` rather than a custom `aboard://` scheme because the spec
reserves `https://` for resources a client could fetch on its own, and these
genuinely are: public, CORS-open, served at that exact path. They name the API
document, not the claim's `@id`, which is its page (`/claims/M4`).

Only the graph is enumerated. Listing every claim would make `resources/list` an
IO operation, and `src/lib/mcp/resources.ts` is pure so the wire behaviour stays
testable without a network; per-claim reads are a template instead, which is what
templates are for. A URI that names nothing we serve, and a template read whose
claim does not exist, both answer `-32002` at HTTP `200`: the method routed and
ran, so a `404` there would be indistinguishable from the modern era's "no such
method". Resources are public exactly as the read tools are, and `?auth=required`
challenges them exactly as it challenges everything else.

**`prompts` is deliberately not declared**, and `prompts/list` answers `-32601`.
A server declares only what it serves, and the spec requires both parties to use
only negotiated capabilities, so an empty `prompts` declaration would buy nothing
but a wasted round-trip per connection. Scanners that call it regardless (Smithery
does) log the error as a defect; it is the scanner calling a method it was told
not to. Same reasoning kept `logging` and `completions` undeclared.

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

- **`authorization_response_iss_parameter_supported` is not advertised**, though
  `iss` is emitted on every authorization response including errors. The
  provider library generates the authorization server metadata document and
  does not expose that field, and claiming support we cannot guarantee across
  every response is worse than staying silent. Under the spec's own
  compatibility table this is the row that still validates: a client that
  recorded our issuer compares a present `iss`, and one that did not proceeds.
  Revisit if the library gains the field.
- **Static token revocation is manual.** A token is trusted to behave within
  its rate; to revoke, delete its line from `ABOARD_AGENT_TOKENS`. Do not hand
  a token to something you would not hand the repo to. OAuth grants are
  revocable through the provider's own grant store instead.
- **Static tokens have no deprecation date.** They are the shipped contract for
  the generator script and the stdio server, and OAuth does not make them
  wrong. Revisit once something other than the operator holds an OAuth
  credential.
- **One scope, `aboard:propose`,** covering all four write tools. Per-kind
  scopes can come later if a real caller wants narrower access; inventing four
  now would be a guess about a consumer that does not exist.
- **Client registration is open, and deliberately so.** Dynamic Client
  Registration is unauthenticated by design: a client that has never met this
  server still has to be able to obtain a `client_id`. That makes
  `/oauth/register` the only unauthenticated write into `OAUTH_KV`. Two things
  bound it. Registrations expire after 90 days (`clientRegistrationTTL`, stated
  explicitly in `worker/oauth.ts` rather than inherited), and
  `REGISTRATION_LIMITER` caps the endpoint at 5 per minute per client IP. A
  registered client can still do nothing on its own: a human must sign in and
  approve consent before any token exists.
- **Whether DCR is needed at all is worth revisiting.** The `2026-07-28`
  revision deprecates it in favour of Client ID Metadata Documents, which are
  enabled here and store nothing, since the client id is a URL fetched on
  demand. A CIMD-only server would have no registration write path to abuse.
  Keeping DCR is a compatibility choice: most clients shipping today still use
  it. Revisit once real clients show what they speak.
- **All four write tools are wired** (`propose_claim`, `propose_edge`,
  `propose_forecast_prediction`, `propose_dossier`).
- **A PAT, not a GitHub App.** The plan's stated v1. An App is the end state.
- **New domains are refused.** Minting an id needs an existing prefix to extend,
  and inventing one would silently fork a domain's namespace. A human seeds a new
  domain's first claim. The same applies to an edge in a domain with no claims.
- **No duplicate-edge check.** Two proposals can proffer the same relation; the
  reviewer catches it. The loader's referential-integrity gate catches dangling
  endpoints, but not redundancy.
