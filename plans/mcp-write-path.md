# Plan: MCP write path — wire the four `propose_*` tools

> **Status (2026-07-18, session 20): `propose_claim`, `propose_edge`, and
> `propose_forecast_prediction` are live.**
>
> **The architecture below is wrong, and was corrected in the build.** This plan
> specifies a Next.js API route (`POST /api/proposals`). That is impossible:
> session 14 migrated the site to static export, and under `output: "export"`
> Next supports **`GET` only** in Route Handlers, with no server runtime. The
> plan predates the migration and was never reconciled with it.
>
> The endpoint lives in the **Cloudflare Worker** that already fronts the static
> assets (`worker/index.ts`, `wrangler.jsonc`). Every property this plan actually
> wanted survives: same origin, the GitHub credential never leaves the server,
> and the canonical Zod schemas in `src/lib/types.ts` remain the single source of
> validation truth. The static export stays intact.
>
> Done: steps 1–5 and 7 for claims (session 18), `propose_edge` (session 19),
> and `propose_forecast_prediction` (session 20). Remaining:
> `propose_dossier_position` (which is really a whole two-sided dossier — see
> below), plus rate limiting, which needs a KV or Durable Object binding.
> Contract and operator runbook: `worker/README.md`.

Convert the MCP server's stubbed write tools into a real gated write path:
agent proposes → canonical Zod validation → branch + PR → human merge. This is
the largest gap between aboard's agent-first framing and its function (the
server's four write tools currently return `NOT_WIRED`). Design rationale
lives in `research/agent-onboarding.md`; enforcement rationale in
`research/integrity-anti-gaming.md` and `research/sybil-identity.md`.

## Context

`mcp-server/` (541 lines, stdio transport) already ships five working read
tools against the JSON-LD API and declares `propose_claim`, `propose_edge`,
`propose_forecast_prediction`, `propose_dossier_position` with input schemas
mirroring the Zod types. What's missing is everything behind them: validation
against the canonical schema, authorization, and the PR-opening pipeline.

The integrity research settled the posture: **PR-only writes** (never
autonomous merge), **zero-trust-by-default**, human review as the admission
gate (the Wikipedia-BAG pattern — the only Sybil defense with a long track
record). This plan implements that posture; it deliberately does not attempt
reputation, scoring, or laundering detection (gated roadmap in
`integrity-foundations.md`).

## Architecture decision (recommended)

Put validation + PR-opening in a **Next.js API route** (`POST /api/proposals`),
not in the MCP server:

- The route imports the canonical Zod schemas from `src/lib/types.ts` — one
  validation source, no type duplication (the sibling-vs-in-tree dilemma in
  `agent-onboarding.md` dissolves: the MCP server stays a thin HTTP client).
- The server-side GitHub credential never leaves the deployment.
- Any non-MCP agent can also use the endpoint directly — the MCP tools become
  a convenience layer, which is the right shape for a substrate.

The MCP `propose_*` handlers then: forward payload + bearer token to
`/api/proposals`, return the structured result (PR URL on success; the Zod
error path on rejection, pointing at the offending field).

## Build sequence (v1 slice first: `propose_claim` end-to-end, ~2–3 days)

1. **`POST /api/proposals` route** — body `{kind: "claim" | "edge" |
   "prediction" | "dossier_position", payload, rationale}`. Validate payload
   with the canonical Zod schema for its kind; on failure return 422 with the
   Zod issue path (structured, agent-parseable).
2. **Auth** — `Authorization: Bearer <token>`; tokens from an env-var
   allowlist (`ABOARD_AGENT_TOKENS`), each token mapping to an attribution
   string that is stamped into `AgentAttribution` server-side (never trust the
   payload's own attribution). Manual issuance/rotation — fine at this scale.
3. **File emission** — reuse/extend `src/lib/data/exporter.ts` (the PR-pack
   exporter is already the loader's inverse) to serialize the validated
   payload to its `data/` target (claim `.md` with frontmatter; YAML append
   for predictions/edges/dossiers — append-only, matching the forecaster's
   audit-trail convention).
4. **Branch + PR** — GitHub REST via a fine-grained PAT on a bot account
   (contents + pull-requests on this repo only). Branch
   `agent/<token-id>/<timestamp>`; PR body carries the rationale + a
   provenance block. A GitHub App is the end state; a PAT is v1.
5. **Wire `propose_claim`** in `mcp-server/tools/write.ts` to the route;
   verify end-to-end from a real agent session.
6. **Repeat for the other three tools** (mostly serialization variants).
7. **`AgentAttribution` upgrade — now, not later.** The repo deferred this
   "until the access pattern is known"; this plan is that access pattern. Add
   optional `operator` (the accountable human/org behind the token) and
   `agentId` (stable hash of model + prompt title/hash + tool stack — the
   ERC-8004 *pattern*, off-chain) to `AgentAttribution`. Ripple, same commit:
   `public/schema/v0.json`, `src/lib/jsonld.ts`, `research/schema.md`.

## Prereqs / interactions

- **CI must exist first** (`repo-hardening.md`): the whole trust story is
  "the PR is validated by the same loader that gates the build." Without CI on
  PRs, a malformed agent proposal is only caught at the next local build.
- `integrity-foundations.md`'s resolution-criteria lint should run on
  `propose_forecast_prediction` / new-forecast payloads once both exist.

## Decisions to make before coding

- **Proposals to a fork or to branches on the main repo?** Branches on the
  repo (recommended — simpler, PAT-scoped) vs a separate staging repo
  (isolates spam; revisit if volume demands).
- **Rate limiting** — per-token counter in the route (recommended: crude
  in-memory/KV counter, e.g. 10 proposals/day/token) vs none for v1.
- **Auto-merge tier** — explicitly **no** for v1 (matches the research);
  revisit only with a scored track record per token.

## Verification

1. A Claude Code session (or any MCP client) calls `propose_claim` with a
   valid payload → PR opens, CI passes, loader accepts the file on merge.
2. Same call with a bad field → structured 422 naming the field path; no
   branch created.
3. Missing/unknown token → 401; nothing written.
4. Committed file carries server-stamped `AgentAttribution` (operator +
   agentId), not caller-supplied attribution.

## Out of scope

- Proof-of-personhood integration, reputation, Brier scoring, CIDRE laundering
  detection (gated roadmap — needs write volume to exist first).
- OAuth flows, key self-service, GitHub App migration.
- Auto-merge of any kind.
