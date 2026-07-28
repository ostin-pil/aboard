# Plan: MCP write path — shipped

> **Status: done.** The four write tools went live in sessions 18–20; the remote
> MCP endpoint that fronts them went live in session 30. This file is now a
> record of what was built and why it differs from what was planned, not a brief
> to execute. The live contract and operator runbook are `worker/README.md`.

Convert the MCP server's stubbed write tools into a real gated write path: agent
proposes → canonical Zod validation → branch + PR → human merge. Design
rationale lives in `research/agent-onboarding.md`; enforcement rationale in
`research/integrity-anti-gaming.md` and `research/sybil-identity.md`.

## What shipped

- **`POST /api/proposals`** in the Cloudflare Worker (`worker/index.ts`).
  Envelope `{kind, payload, rationale}` over the four kinds `claim`, `edge`,
  `prediction`, `dossier`. Validated by the canonical schemas in
  `src/lib/proposals.ts`, which are pure and unit-tested.
- **Auth** by `Authorization: Bearer`, against an `ABOARD_AGENT_TOKENS` table
  mapping each token to the provenance stamped into what it files. The caller
  supplies content; it never supplies identity, ids, or timestamps.
- **Rate limiting** through the native Workers binding (`PROPOSAL_LIMITER`),
  keyed per credential, failing open.
- **Branch + PR** via GitHub REST on a fine-grained PAT. Never merges.
- **`POST /mcp`** (session 30): a stateless remote MCP server in the same
  Worker (`worker/mcp.ts`, `src/lib/mcp/`), exposing five read tools and the
  same four `propose_*` tools. Its write tools call the same `runProposal`
  internals, so an MCP write and an HTTP write are one write path.
- **The stdio server** in `mcp-server/` still works, for local and IDE use.

## Where the plan was wrong, and why it matters

**The endpoint is not a Next.js API route.** This plan originally specified
`POST /api/proposals` as a Next Route Handler. That was never buildable: session
14 had already migrated the site to static export, and under `output: "export"`
Next supports **`GET` only**, with no server runtime. The plan predated the
migration and was not reconciled with it before being written down.

The Worker was the fix, and every property the plan actually wanted survived
intact: same origin, the GitHub credential never leaving the server, and the
canonical Zod schemas remaining the single source of validation truth. The
lesson worth keeping is narrower than "check your assumptions": a plan that
names an implementation surface should be re-read against the deployment model
the day it is picked up, because the deployment model is exactly the thing that
changes between a plan being written and being executed.

**`propose_dossier` replaced `propose_dossier_position`.** The plan proposed a
tool for one side of a dossier. A dossier requires both sides to exist at all, so
a one-sided proposal cannot form a valid one. The shipped tool proposes a
COMPLETE dual-dossier for a claim that lacks one, and refuses to overwrite a
curated one.

**CI-before-writes did not hold as a hard prereq.** The plan gated the write
path on CI existing, on the reasoning that the trust story is "the PR is
validated by the same loader that gates the build". The write path shipped
first. The posture held anyway because nothing auto-merges: an unvalidated
proposal sits in a PR a human must read, so the worst case was a malformed file
in an open branch, not in the graph.

## Still open

- **`AgentAttribution` upgrade.** The plan's step 7 (adding `operator` and
  `agentId` to the type itself, with the ripple into `public/schema/v0.json`,
  `src/lib/jsonld.ts` and `research/schema.md`) has not landed. Both fields are
  stamped into PR bodies today, but they are not part of the published schema.
- **OAuth 2.1 + PKCE** for the MCP endpoint. Static bearer tokens are v1 and
  match the write path; OAuth is where a public multi-tenant server ends up.
  Now has its own brief, `plans/mcp-oauth.md`, written in session 31.
- **A GitHub App** instead of a PAT.
- **Resolution-criteria lint** on prediction and new-forecast payloads, once
  `plans/integrity-foundations.md`'s do-now slice exists.

## Explicitly out of scope

Proof-of-personhood, reputation, Brier scoring, and laundering detection all
need write volume to exist first (gated roadmap in
`plans/integrity-foundations.md`). Auto-merge of any kind is not on the roadmap:
human review is the admission gate, which is the only Sybil defense with a long
track record.
