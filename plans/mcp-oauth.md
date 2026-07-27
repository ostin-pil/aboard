# Plan: OAuth 2.1 + PKCE for `/mcp`

Give the remote MCP endpoint an authorization story that MCP clients can
discover and complete on their own, replacing hand-issued bearer tokens as
the only way in. Written 2026-07-27, session 31, against the state of the
code after session 30 (`worker/mcp.ts`, `src/lib/mcp/`, `worker/index.ts`).

The live contract and operator runbook are `worker/README.md`. Identity and
admission rationale live in `research/sybil-identity.md` and
`research/integrity-anti-gaming.md`.

## Context

Session 30 shipped `POST /mcp` with nine tools. Five read tools are open to
anyone; four `propose_*` tools require `Authorization: Bearer <token>`
against the `ABOARD_AGENT_TOKENS` table, and open a pull request that a human
must merge. A write attempt without a credential comes back as a tool-level
error carrying a sentence of prose.

Three independent lines converged on OAuth in the session 30 post-merge pass,
which is what makes this a decision rather than a preference.

1. Two of the five failures in the weakest yardstick scan category are
   OAuth-shaped (OIDC discovery, Protected Resource metadata).
2. Smithery's auth model is OAuth. A Smithery user can list the four
   `propose_*` tools and cannot call them, because a static bearer token is
   not something their gateway can obtain on a user's behalf.
3. MCP's own auth story is built on RFC 9728. Our 401 carries no
   `WWW-Authenticate` header, so an agent that wants to authenticate has
   nothing to follow.

The subscore was never the argument. Two real consumers and the protocol's
own spec are.

## Premise check, before any code

Session 30's lesson was that a plan's timing and spec claims get verified
before they are built on. Everything below was checked against the published
specification on 2026-07-27, the day before the `2026-07-28` revision goes
final.

**What the spec requires of us as a resource server.** Authorization is
OPTIONAL for MCP implementations; a server that implements it takes on these:

- MCP servers MUST implement RFC 9728 Protected Resource Metadata, and the
  document MUST include `authorization_servers` with at least one entry.
- Servers MUST validate that access tokens were issued specifically for them
  as the intended audience (RFC 8707), MUST reject tokens that do not include
  them in the audience, MUST NOT accept or transit any other tokens, and MUST
  NOT pass a client's token through to an upstream API.
- Invalid or expired tokens MUST receive HTTP 401. Insufficient scope SHOULD
  receive HTTP 403 with `error="insufficient_scope"`, a `scope` parameter,
  and `resource_metadata`.
- Servers SHOULD include a `scope` parameter in the `WWW-Authenticate`
  header, and SHOULD NOT include `offline_access` in `scopes_supported`.

**Discovery has two mechanisms and we should serve both.** A server MUST
implement one of `WWW-Authenticate` with `resource_metadata`, or a well-known
URI; clients MUST support both and prefer the header when present. The
well-known URI is path-aware. For an endpoint at `https://aboard.untype.me/mcp`
the document belongs at

```
https://aboard.untype.me/.well-known/oauth-protected-resource/mcp
```

with `https://aboard.untype.me/.well-known/oauth-protected-resource` as the
root fallback clients try second. Session 30 already learned this shape of
lesson with the server card, where four spellings of one filename were in
circulation. Serve both paths.

**What changed in `2026-07-28`, and what did not.** The authorization changes
are hardening, not the breaking rewrite the stateless core was. Six SEPs land:
RFC 9207 `iss` validation against mix-up attacks (SEP-2468), credentials bound
to the issuing authorization server's `issuer` (SEP-2352), scope accumulation
during step-up (SEP-2350), the `.well-known` discovery suffix (SEP-2351), and
two OpenID Connect items. For an authorization server the practical additions
are that it SHOULD emit `iss` in authorization responses including errors, and
MUST then advertise `authorization_response_iss_parameter_supported: true`. A
future revision is expected to raise that SHOULD to MUST, so emit it now.

Client ID Metadata Documents are now the preferred registration path, and
Dynamic Client Registration is explicitly "deprecated and retained for
backwards compatibility". DCR remains a MAY for authorization servers and
clients still fall back to it, so a DCR-only server is usable today. Treat
CIMD as a follow-up, not a launch requirement, and record that it is where
this ends up.

**Three corrections to what this session assumed at the start.**

*Protected Resource Metadata cannot ship ahead of an authorization server.*
The session-start briefing floated shipping the PRM document and the
`WWW-Authenticate` header first as a cheap, well-specified win, with the
issuance question deferred. That split does not hold: MCP makes
`authorization_servers` a required field with at least one real entry, so the
document cannot be written until we know what issues tokens. The metadata and
the issuer ship together.

*GitHub cannot be the authorization server, though it can be the identity
provider.* GitHub does now publish RFC 8414 metadata at
`https://github.com/.well-known/oauth-authorization-server/login/oauth` with
issuer `https://github.com/login/oauth`, which makes pointing
`authorization_servers` straight at GitHub look viable. It is not, for two
reasons that are both fatal on their own. GitHub supports neither DCR nor
CIMD, so an arbitrary MCP client such as Claude Desktop or Smithery has no way
to obtain a `client_id`, and manual pre-registration of every client is not a
model. And GitHub does not support resource indicators, so a GitHub token is
issued for a GitHub OAuth App rather than for `https://aboard.untype.me/mcp`;
accepting one would be precisely the audience-validation failure the spec
forbids with a MUST. GitHub belongs upstream of our authorization server as
the thing that authenticates a human, not in front of it.

*aboard becomes an authorization server, and that costs statelessness.*
`wrangler.jsonc` currently records that `/mcp` needs no binding of its own:
no KV, no Durable Object, because the stateless revision removed the session
we never had. That property survives for the MCP protocol core and every read
tool. It does not survive for token issuance, which needs somewhere to keep
authorization codes, registered clients, and grants. Adding a KV namespace is
the honest cost of this slice, and the comment in `wrangler.jsonc` that claims
otherwise gets corrected in the same commit that adds the binding.

## The shape of the problem, which is aboard-specific

The MCP authorization spec assumes a protected server. aboard's `/mcp` is
half public and stays that way: anonymous read is a project value, and the
five read tools project data that is already published as JSON-LD to anyone
who asks. Only the four `propose_*` tools are gated.

That makes the challenge a per-call decision rather than a per-endpoint one,
and it is the design's load-bearing detail:

| Caller state | Read tool | Write tool |
| --- | --- | --- |
| No credential | 200 | **401** with `WWW-Authenticate` |
| Static agent token | 200 | 201, unchanged from today |
| OAuth token, `aboard:propose` | 200 | 201 |
| OAuth token, scope missing | 200 | **403** `insufficient_scope` |
| Invalid or expired token | 200 | **401** with `WWW-Authenticate` |

Two consequences worth being deliberate about.

`tools/list` stays anonymous and keeps listing all nine tools. A client that
cannot see the write tools has no reason to authenticate, and the 401 on first
call is the thing that teaches it how.

The 401 replaces today's tool-level error for the missing-credential case
only, and this is a line worth drawing precisely. Session 30 made proposal
rejections tool-level errors so a model could read the field paths and retry,
which is exactly what `isError` is for. A missing credential is not something
the model can fix by editing its payload; it is something the client has to
fix by authenticating. Validation failures stay tool-level errors. Credential
failures become HTTP status codes the transport layer already knows how to
act on.

## Decisions this slice has to make

**Who may obtain a write credential.** This is the project-posture decision
and it is not a technical one. Three options: any authenticated GitHub
account, an allowlist of GitHub logins, or manual approval on first use. The
argument for the open end is that human review of every PR is already the
admission gate, and `plans/mcp-write-path.md` records it as the only Sybil
defense with a long track record. The argument for the narrow end is that
opening issuance turns a hand-issued credential into an unbounded supply of
them, and rate limiting per subject caps burst rather than volume.
Recommendation is an allowlist that is empty-means-open, defaulting to open,
because it costs one environment variable and converts the decision into a
lever that can be pulled the day it is needed rather than a rebuild.

**Static tokens keep working, with no deprecation date set here.** They are
the shipped contract, they are what the `scripts/` generator and the stdio
server use, and OAuth does not make them wrong. Identity resolution becomes
two-source. Revisit once something other than the operator holds an OAuth
credential.

**Scopes stay minimal.** One scope, `aboard:propose`, covering all four write
tools. Read needs none, so `scopes_supported` is a single-element list. Per
kind scopes can come later if a real caller wants to grant narrower access;
inventing four scopes now is a guess about a consumer that does not exist.

**Provenance improves, and that is the part worth caring about.** Today
`TokenIdentity` carries `{tokenId, operator, agent, agentId}` from a table a
human wrote by hand. With GitHub upstream, `operator` becomes a verified
GitHub login, and `agent` and `agentId` come from the registered OAuth client
rather than from self-description. That is strictly better provenance on every
PR the write path opens, and it is the reason to do this beyond the three
motivations above. It also composes with the open `AgentAttribution` schema
item carried since `plans/mcp-write-path.md` step 7: the fields that upgrade
are the same fields.

Note that the stateless revision removed the `initialize` handshake, so
`clientInfo` is not available to a modern-era request. The OAuth client
registration is where the agent's name now comes from, which is a better
source anyway because it is bound to the credential.

## Step 0, the gate: spike the Cloudflare provider's auth model

`@cloudflare/workers-oauth-provider` is the obvious substrate. It needs one KV
namespace bound as `OAUTH_KV`, serves `/.well-known/oauth-protected-resource`
and `/.well-known/oauth-authorization-server`, implements DCR and PKCE, takes
a plain `ExportedHandler` as `apiHandler` rather than requiring the McpAgent
Durable Object, and hands the authorized identity to the handler as
`ctx.props`. All of that fits.

One thing does not obviously fit, and it decides the whole build. The library
routes `apiRoute` paths through token validation and, on the documentation's
own phrasing, passes the request to the API handler when it "receives an API
request with a valid access token". If unauthenticated requests to an
`apiRoute` are rejected with a 401 before the handler sees them, then routing
`/mcp` as an `apiRoute` breaks anonymous reads, which is not negotiable.

Spike it before writing anything else. Read the source rather than the README;
this is a question the docs do not answer. Two outcomes:

- **Path A, the library.** If the handler can receive anonymous requests, or
  if `/mcp` can stay on the `defaultHandler` while the library still exposes
  token validation to it, use the library. The AS endpoints, DCR, PKCE, and
  the metadata documents all come for free.
- **Path B, hand-rolled.** If authentication on `apiRoute` is binary with no
  way through, write the authorization server directly. It is more code and
  it is not exotic: an authorize endpoint, a token endpoint, a registration
  endpoint, signed JWTs so that validation at the resource server needs no
  round trip, and KV for codes, clients, and grants only.

Also settle during the spike whether the library honours the `resource`
parameter (RFC 8707) and emits `iss` (RFC 9207). If it does neither, Path B
gets more attractive, because both are requirements we would otherwise be
patching around.

Timebox this to one sitting. It is the only thing in this plan whose answer
changes the shape of everything after it.

## The build

Ordered so that each step is independently reviewable, with the pure logic
landing before the IO that uses it. The project's split holds throughout:
decisions in `src/lib/`, IO in `worker/`.

### 1. Two-source identity resolution

Replace `resolveIdentity` in `worker/index.ts` with a pure resolver in
`src/lib/mcp/auth.ts` (new) returning a discriminated union:

```ts
type Credential =
  | { kind: "static"; identity: TokenIdentity }
  | { kind: "oauth"; subject: string; login: string; clientId: string;
      clientName: string; scopes: string[] }
  | { kind: "none" }
  | { kind: "invalid" };
```

`none` and `invalid` are distinct because only the second is worth logging,
and both produce a 401. Unit-test the parsing and the precedence rule (an
OAuth token wins where both are somehow present). The Worker keeps only the
lookup that touches the token table and the JWT verification.

### 2. The challenge, as a pure decision

Also in `src/lib/mcp/auth.ts`: given a resolved credential and a planned tool
call, return either `allow` or a challenge carrying the status code and the
exact `WWW-Authenticate` value. Two shapes, both from the spec:

```
401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://aboard.untype.me/.well-known/oauth-protected-resource/mcp",
                         scope="aboard:propose"

403 Forbidden
WWW-Authenticate: Bearer error="insufficient_scope",
                         scope="aboard:propose",
                         resource_metadata="https://aboard.untype.me/.well-known/oauth-protected-resource/mcp"
```

The origin comes from `CANONICAL_ORIGIN`, not from a hardcoded string and not
from `siteBaseUrl()`, for the reason session 30 recorded: the Worker has no
`process.env`, and the canonical-URL guard catches this class of mistake.

Wire it into `worker/mcp.ts` at the point where a write tool is dispatched,
and into `runProposal` in `worker/index.ts` so that `POST /api/proposals`
carries the same header on its 401. The two doors keep sharing one definition
of who may write, which was the whole point of splitting `runProposal` out.

### 3. The metadata documents

Serve the Protected Resource Metadata at both the path-aware and root
locations. On Path A the library serves the root document and the path-aware
one needs the `resourceMetadata` option, because the library defaults to the
request origin as the resource identifier and ours is `.../mcp`. On Path B
both are static JSON under `public/.well-known/`, with a `Content-Type` rule
in `public/_headers` exactly as `/.well-known/api-catalog` already does, since
the path-aware file has no extension.

The document names `https://aboard.untype.me/mcp` as `resource`, our own
origin as the single `authorization_servers` entry, `["aboard:propose"]` as
`scopes_supported`, and `["header"]` as
`bearer_methods_supported`. No `offline_access`.

### 4. The authorization server

The user-facing half, and the only part of this plan that renders HTML. Two
requirements here are easy to miss and both are spec text: the consent screen
MUST clearly display the redirect URI hostname, and localhost-only redirect
URIs SHOULD carry an additional warning, because a Client ID Metadata Document
cannot prevent localhost impersonation.

- `/oauth/authorize` starts the flow, sends the human to GitHub to log in,
  and on return shows a consent screen naming the client, the redirect URI
  hostname, and the single scope being requested.
- `/oauth/callback` completes the GitHub leg and mints an authorization code.
- `/oauth/token` exchanges code plus `code_verifier` for an access token,
  enforcing PKCE `S256` and rejecting `plain`.
- `/oauth/register` implements DCR, since it is what today's clients fall back
  to. CIMD support is the follow-up.
- Authorization responses carry `iss`, including error responses, and the AS
  metadata advertises `authorization_response_iss_parameter_supported: true`.
- The `resource` parameter is honoured and bound into the token's audience.

Tokens are audience-bound to `https://aboard.untype.me/mcp` and short-lived.
On Path B they are signed JWTs, so the resource server validates with a key
and no storage read, which keeps the hot path as stateless as it is today.

Secrets follow the existing posture, set with `wrangler secret put` and never
committed: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and on
Path B a signing key. With none of them set, the endpoint degrades to exactly
today's behaviour, which is static tokens only and no metadata advertised.
That mirrors how `/api/proposals` answers 503 `not_configured` rather than
breaking the site, and it is what keeps this deployable in stages.

The PRs are still opened by aboard's own fine-grained PAT. The GitHub login
establishes who is asking, not what opens the pull request. Using a user's own
token to open PRs from their own fork is a different design with a real fork
story behind it, and it is out of scope here.

### 5. Provenance and rate limiting

Stamp the verified GitHub login into the PR body as `operator`, and the
registered client as `agent` and `agentId`. Key `PROPOSAL_LIMITER` on the
OAuth subject where there is one, falling back to `tokenId` for static
credentials, so one identity cannot open an unbounded burst regardless of
which door it came through.

This is the natural moment to close the `AgentAttribution` schema item, since
the fields being stamped are the fields that are missing from
`public/schema/v0.json`. If that lands here, `jsonld.ts`, `types.ts`,
`public/schema/v0.json` and `research/schema.md` move in the same commit, per
the CLAUDE.md rule. If it is deferred again, say so in the session log rather
than leaving it implied.

### 6. Documentation, and `/auth.md`

`worker/README.md` gains the OAuth contract and its operator notes.
`content/about.md` and `src/app/llms.txt/route.ts` describe how an agent
authenticates. The server card at `public/.well-known/mcp.json` gets whatever
the registry schema provides for advertising authorization; check the schema
rather than inventing a field.

`/auth.md` rides along here. Session 30 declined to chase it alone as a
low-adoption convention while noting it was honest and cheap, and folding it
into the work that makes it true is the right occasion.

## Verification

Three layers, matching what session 30 established, because each catches what
the others cannot.

- **Unit tests** over `src/lib/mcp/auth.ts`: credential parsing for both
  sources, the precedence rule, every challenge shape, exact
  `WWW-Authenticate` strings, scope sufficiency including the insufficient
  case, and the anonymous-read path staying open.
- **End-to-end checks** against `wrangler dev` and then production, extending
  the existing smoke script: anonymous read still 200, anonymous write 401
  with a parseable header, both metadata documents fetchable and valid against
  RFC 9728, the discovery chain from 401 to PRM to AS metadata resolving, a
  token with no `aboard:propose` getting 403, a static token still writing,
  PKCE `plain` refused, and a token minted for a different audience refused.
- **A real client doing the whole dance.** An `@modelcontextprotocol/sdk`
  client with no credential, driven through discovery, registration,
  authorization, and a successful `propose_claim`. This is the check curl
  cannot make and the one that decides whether this shipped.

Then re-scan `isitagentready.com/aboard.untype.me`. Two OAuth-shaped checks in
the weakest category should move. Treat that as confirmation rather than as
the goal, and remember from session 30 that a smoke run immediately after
`wrangler deploy` can lie while the edge is still propagating.

## Out of scope

- **CIMD.** Preferred by the current spec, and the follow-up to DCR. Not a
  launch requirement, because clients still fall back to DCR.
- **Per-kind write scopes.** One scope until a caller wants narrower.
- **A GitHub App replacing the PAT.** Carried from `plans/mcp-write-path.md`
  and unaffected by this.
- **Opening PRs as the authenticated user.** Needs a fork story.
- **Anything that auto-merges.** Human review stays the admission gate.

## Open questions for whoever picks this up

1. Issuance posture, which is the one decision that is genuinely the
   project's rather than the implementation's. Recommendation above is an
   allowlist defaulting to open.
2. Path A or Path B, answered by the step 0 spike rather than by preference.
3. Whether the authorization server co-hosts in this Worker or gets its own.
   Co-hosting is simpler and keeps discovery same-origin; a separate Worker
   would preserve the current "no bindings" property for `/mcp` at the cost of
   a second deploy target. Recommendation is to co-host and correct the
   `wrangler.jsonc` comment.
4. Whether `AgentAttribution`'s schema upgrade lands in this slice or gets
   deferred a third time.
