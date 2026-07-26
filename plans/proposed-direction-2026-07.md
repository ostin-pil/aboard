# Plan: implement the 2026-07 Proposed Direction

Roadmap that sequences the reflection's Proposed Direction
(`research/reflection-2026-07.md` §4) into three PR-sized build slices. It does
not replace the per-workstream plans it draws on — `agent-surface.md`,
`mcp-write-path.md`, `integrity-foundations.md`, `corpus-growth.md` — it orders
them and reconciles them with the current (verified 2026-07-22) state of the
code, which several of those plans predate.

## Context

The 2026-07-22 reflection took stock after sessions 14–25 moved aboard from
local prototype to a running public system (24 claims / 25 edges / 3 domains
live, the agent write path live end-to-end, the FLF entry submitted). Three
fresh landscape sweeps confirmed the differentiation thesis is still
unfalsified, but the field moved: forecasting is commoditizing ("the bottleneck
is product, not accuracy"), agents writing into human-gated pipelines now works
at platform scale (X Community Notes), and the agent-web now has an industry
checklist (Cloudflare Agent Readiness) plus a stateless MCP spec (2026-07-28)
that lets one MCP server front every major client.

It also surfaced a live liability: **the production robots.txt blocks every
major AI crawler** — for a project whose thesis is agent readability, the front
door is closed.

Order matters: slice 1 opens the door, slice 2 makes the door a real agent
front-door, slice 3 grows what's behind it. Each slice is one session / one PR
per `.claude/rules/workflow.md`. The audit batches 3/4
(`plans/code-quality-audit.md`) and funding (`plans/funding-applications.md`)
are referenced, not re-planned — slices 1 and 2 strengthen the funding pitch as
they land.

## Current state (verified 2026-07-22, against `main`)

What already exists (do not rebuild):

- **Canonical URL helper** — `src/lib/site.ts` (`siteBaseUrl()`, `siteHost()`,
  `CANONICAL_ORIGIN = https://aboard.untype.me`, `SITE_URL` override). Batch-1
  work; the invariant test `src/lib/canonical-urls.test.ts` allows only
  `site.ts`/`vocab.ts` to spell origin literals.
- **Claim pages** already embed `<script type="application/ld+json">` via
  `fullClaimLD` (`src/lib/jsonld.ts`) and render edge/dossier neighbors as real
  `<Link>`s. Forecasts render inline (no standalone page).
- **The write path is fully live** — `POST /api/proposals` in the Worker
  (`worker/index.ts`), all four `propose_*` kinds validated by the canonical Zod
  schemas (`src/lib/proposals.ts`), server-stamped provenance, native
  rate-limiting (`PROPOSAL_LIMITER`), branch+PR via GitHub REST, never
  auto-merges.
- **A stdio MCP server** — `mcp-server/` (separate private package, 9 tools:
  5 read + 4 write) forwarding writes to `/api/proposals`. **stdio only**, local.
- **Ensemble forecaster + math** — `scripts/forecasters/ensemble-predict.ts`
  (append-only `--update`), `providers.local.json` (4 live Groq models),
  `src/lib/forecast.ts` (`median`/`spread`/`aggregate`/`leaveOneOut`/`simulatedN`).

What's missing (the work): robots.txt / sitemap / llms.txt / markdown twins /
`Link: rel=alternate` / an agents surface; a remote MCP endpoint + server card;
the `resolutionSource`/`resolvedOutcome`/`resolvedAt` fields + resolution lint;
required `Edge.rationale`; the inequality ensemble run, short-horizon forecast
slate, and 2 new dossiers.

Stale copy to fix along the way: `src/app/about/page.tsx` (~L279–289) says the
MCP write tools are "not yet shipped" and names a nonexistent `search_claims`
tool; it also says "two domains / twenty seed claims" (now three / 24).
`mcp-server/README.md`, `plans/mcp-write-path.md` body, and
`research/agent-onboarding.md` also lag the shipped code.

---

## Slice 1 — Discovery surface (one session / PR)

**Goal.** Open the front door and ship the high-leverage form of agent
readability (WordLift: dereferenceable pages + navigation + agent instructions,
not bare markup). Yardstick: isitagentready.com score + first observed
AI-crawler hits in Worker logs.

**Crawler policy (decided): allow all AI use** — search *and* training. aboard
is licensed, published substrate meant to be consumed; being in the weights
means agents know it exists.

1. **`public/robots.txt`** (static file, full control of Content-Signal syntax —
   `app/robots.ts`'s typed `MetadataRoute.Robots` can't express Content-Signal
   lines). Contents: `User-agent: *` / `Allow: /`;
   `Content-Signal: search=yes,ai-train=yes,use=reference`; explicit `Allow` for
   the retrieval + training bots (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
   Claude-User, PerplexityBot, Google-Extended, CCBot, Amazonbot, Bytespider,
   meta-externalagent); a `Sitemap:` line (absolute; robots.txt is static, so
   hardcode `CANONICAL_ORIGIN` and carve it out in the canonical-urls test — see
   decision below); a comment pointing at `/llms.txt`.
2. **`src/app/sitemap.ts`** returning `MetadataRoute.Sitemap` — every claim,
   dossier, and static page, absolute URLs via `siteBaseUrl()`, **truthful
   `lastModified`** derived from each claim's `AgentAttribution` timestamp(s)
   (max), build date only as the honest fallback where none exists. Static-
   exports under `output: "export"`.
3. **`src/app/llms.txt/route.ts`** — GET handler, `export const dynamic =
   "force-static"`, mirroring `src/app/api/graph/route.ts`. Body: one-paragraph
   description + license line; the API surface (`/api/graph`,
   `/api/claims/{id}`, `/schema/v0.json`, `application/ld+json`, CORS open);
   a generated index of all claims grouped by domain
   (`- [{id}: {title}]({abs-url})` from the `graph` accessor + `siteBaseUrl()`),
   forecasts/dossiers under their claims; a pointer to the agents surface (§6)
   and the MCP server card (slice 2). Exports to `out/llms.txt` (host infers
   `text/plain` from the `.txt` extension).
4. **Markdown twins per claim** — a GET route handler keyed by claim id
   (`generateStaticParams` over all ids) emitting `text/markdown`: the claim's
   statement (its `data/.../claims/<id>.md` body, frontmatter stripped) plus its
   edges/sources rendered as markdown links. Cloudflare made page-level markdown
   the de-facto agent format and claims are markdown-native, so this is cheap.
   Exact URL shape (`/claims/<id>.md` vs Cloudflare's `<url>/index.md`) is settled
   at implementation; if the dotted route segment fights static export, ship the
   rest of the slice and split the twin into a fast follow rather than block.
5. **`public/_headers`** — add a `Link: </api/claims/:id>; rel="alternate";
   type="application/ld+json"` for `/claims/*` (verify Cloudflare `:id`
   placeholder interpolation in the header value; if unsupported, the existing
   embedded JSON-LD + visible `/api/claims/{id}` anchor already cover the intent,
   so this is a bonus, not a blocker).
6. **Agents surface + stale-copy refresh** — a `## For agents` section on
   `/about` (recommended now; promote to a dedicated `/agents` route once the
   remote MCP lands in slice 2). Imperative prose: how to read (API + schema +
   llms.txt), how to verify (fetch `/schema/v0.json`, validate like
   `clients/validate.ts`), how to contribute (the live `propose_*` tools — no
   longer "not yet shipped"). Fix the stale about-page paragraph (correct tool
   names, live status, three domains / 24 claims) and mark done items in
   `plans/agent-surface.md`.

**Reuse:** `siteBaseUrl()`/`siteHost()` (`src/lib/site.ts`), `graph`
(`src/lib/graph.ts`), the GET-route pattern (`src/app/api/graph/route.ts`),
`fullClaimLD` (`src/lib/jsonld.ts`).

**Decision to make first:** static `public/robots.txt` (hardcodes the origin —
needs a one-line carve-out in the canonical-urls test) vs an `app/robots.ts`
generator (uses `siteBaseUrl()` but can't emit Content-Signal, so Content-Signal
would move to `_headers` as `X-Robots-Tag`/custom). *Recommend static file* for
Content-Signal fidelity; add `robots.txt` to the test's origin-literal
allowlist with a comment.

**Verify:** `curl /llms.txt` lists all 24 claims with resolving absolute URLs;
`/sitemap.xml` validates with truthful `lastmod`; after the dashboard toggle
(operator action below) `curl /robots.txt` serves *our* allow-stance file;
`npx tsc --noEmit` + `npm run build` clean; pages stay server components;
`canonical-urls.test` still green.

---

## Slice 2 — Remote MCP endpoint (one session / PR)

> **Shipped, session 30.** `POST /mcp` in the Worker (`worker/mcp.ts`, pure core
> in `src/lib/mcp/`), nine tools, writes routed through the same `runProposal`
> internals as `/api/proposals`. Server card at `/.well-known/mcp.json` and
> `/.well-known/mcp/server-card.json`.
>
> Two departures from the brief below, both forced by facts it could not have
> had. First, the endpoint is **dual-era**: revision `2026-07-28` (final two days
> after this session) removes the `initialize` handshake and the session
> entirely, while every shipping client still speaks `2025-11-25`. The spec
> sanctions serving both from one endpoint and it is nearly free for a stateless
> server, so it does. Second, the tool schemas are **derived** from the canonical
> Zod payloads via `z.toJSONSchema` rather than duplicated as hand-written JSON
> Schema — the brief recommended the small duplication to avoid coupling the
> Worker to the sibling stdio package, but deriving from `src/lib/proposals.ts`
> (which the Worker already imports) avoids both the coupling and the drift.
>
> Still open from this slice: registry and Smithery listing (operator action 3
> below), and confirming the endpoint against a real client post-deploy.

**Goal.** Elevate from local stdio to a discoverable **remote** MCP server any
client (Claude, ChatGPT, IDEs) can connect to — the "front door for agents"
milestone and the strongest funding-demo artifact. The 2026-07-28 spec is
**stateless**, so no session store / Durable Object is needed, and the Worker
already holds every dependency (Zod validation, id-minting, GitHub PR pipeline,
bearer auth, rate-limiting).

1. **`/mcp` handler in the Worker** — extend the routing in `worker/index.ts`
   (today a bare `pathname === "/api/proposals"` check) to also handle
   `POST /mcp` as a **stateless streamable-HTTP** MCP endpoint: JSON-RPC
   `initialize`, `tools/list`, `tools/call`. Factor the handler into a new
   `worker/mcp.ts` for clarity. The 9 tools reuse existing internals:
   - **5 read tools** (`list_claims`, `get_claim`, `get_graph`, `get_forecast`,
     `get_dossier`) → read the published JSON-LD via the `ASSETS` binding
     (same source the stdio server GETs today).
   - **4 write tools** (`propose_claim`, `propose_edge`,
     `propose_forecast_prediction`, `propose_dossier`) → call the same
     `handleClaim`/`handleEdge`/`handlePrediction`/`handleDossier` internals
     that back `/api/proposals`, through `resolveIdentity` + `withinRateLimit`.
   - Tool metadata (names, descriptions, input schemas) currently lives in the
     stdio package (`mcp-server/src/tools/*`); define the remote tool schemas in
     `worker/mcp.ts` (small duplication) or extract a shared descriptor module —
     *recommend the small duplication* to avoid coupling the Worker build to the
     sibling package.
2. **Auth** — read tools unauthenticated (public substrate); write tools require
   `Authorization: Bearer` via the existing `resolveIdentity` / `ABOARD_AGENT_TOKENS`
   (401 on missing/unknown). OAuth 2.1 + PKCE is the industry end-state but
   deferred; static bearer is v1 and matches the shipped `/api/proposals` model.
3. **Server card** — `public/.well-known/mcp/server-card.json` (static, served
   via `ASSETS`): name, description, the `/mcp` endpoint URL, a tools summary,
   and the auth hint. Path per SEP-1649/2127; Cloudflare Agent Readiness checks
   exactly this. Let `.well-known/*` fall through to `ASSETS` (no new routing).
4. **Keep the stdio server** working for local/IDE use; the remote endpoint is
   the production front door. Fix `mcp-server/README.md`'s self-contradiction
   (its "write tools are stubs" lines are false) and rewrite the stale body of
   `plans/mcp-write-path.md` (retract the Next.js-route design; the endpoint is
   the Worker). Update the agents surface (slice 1) to advertise the remote
   `/mcp` URL + server card.

**Reuse:** `handleProposal` and its `handle*` dispatchers, `resolveIdentity`,
`withinRateLimit` (`worker/index.ts`); `buildClaim`/`buildEdge`/… and the
`ProposalEnvelope`/payload schemas (`src/lib/proposals.ts`); the read-tool URL
shapes from `mcp-server/src/tools/read.ts`.

**Note on infra:** stateless keeps hosting trivial (no `nodejs_compat`, no KV,
no Durable Object). A session-based streamable-HTTP transport would need a
Durable Object — explicitly out of scope; stay stateless.

**Verify:** MCP Inspector (or a Claude client) connects to
`https://aboard.untype.me/mcp`; `tools/list` returns 9; a read tool returns the
graph with no token; `propose_claim` with a valid bearer opens a PR (and CI
passes on it); the same call with no token → 401 while reads still work;
`GET /.well-known/mcp/server-card.json` resolves; isitagentready.com
"capabilities" category passes; `wrangler deploy --dry-run` clean in CI.

---

## Slice 3 — Corpus + resolution rigor (one or two sessions / PRs)

Two logical units with a hard dependency (3a before 3b). Under one-PR-per-session
they may be two PRs; combine only if 3a stays small.

### 3a — Integrity foundations: the resolution anchor (schema-layer)

Implements `plans/integrity-foundations.md`'s do-now slice (still entirely
pending). All schema ripples land in the **same commit** (CLAUDE.md rule).

- **`src/lib/types.ts`** — add to `Forecast`: `resolutionSource: Source`
  (optional initially; the external resolver — reuse the existing `Source` type),
  `resolvedOutcome` (`z.union` of `yes|no|number|null`, optional), `resolvedAt`
  (ISO string, optional). Tighten `Edge.rationale` from `.optional()` to
  `z.string()` (safe — every seed edge already carries rationale; re-verify the
  12/7/3 per-domain inventory before flipping).
- **Backfill** `resolutionSource` for all six forecasts (F1–F5 + IF1) in the same
  PR to keep the corpus clean (the "pre-curated falsifiable claims" wedge).
- **`scripts/lint-resolution.ts`** (new) — flag `resolutionCriteria` that depend
  on someone *saying* something (`/\b(says?|announces?|declares?|tweets?|states?
  that)\b/i`) or that are ill-defined (no concrete metric/threshold/date), per the
  Metaculus checklist. **Warn-only** first; tighten to CI-failing once F1–F5+IF1
  pass. Wire into `vitest` (the repo now has a real `test: vitest run`).
- **Ripple, same commit:** `public/schema/v0.json` (new `Forecast` fields;
  add `aboard:rationale` to the Edge `required` array), `src/lib/jsonld.ts`
  (serialize the new fields under the `aboard:` context), `research/schema.md`.

**Verify:** `npx tsc --noEmit` + `npm run build` clean; `clients/validate.ts`
passes against the updated `v0.json`; the lint catches a deliberately-bad
"…if the President says…" fixture (add, confirm, remove); `/api/graph` JSON-LD
includes `resolutionSource` and (when present) `resolvedOutcome`.

### 3b — Corpus growth (content)

Implements `plans/corpus-growth.md` (unblocked once 3a lands).

- **Inequality ensemble run** — `ensemble-predict.ts --forecast IF1 --config
  scripts/forecasters/providers.local.json --update` appends the 4 Groq
  predictions to `data/inequality/forecasts/IF1.yaml` (today: one Opus seed);
  sanity-check with `scripts/forecast-sanity.ts`. Closes the "half the domains
  have no machine forecast" gap with zero new engineering.
- **Short-horizon forecast slate** (3–5 questions resolving ≤ 2027-03) — each
  carries a `resolutionSource` from day one and passes the lint. Question shape:
  concrete metric + threshold + date from a T1 source (V-Dem/ERT, World Bank/WID,
  Freedom House). This is the wedge that lets **resolved** forecasts — the
  traffic + calibration flywheel — start existing before 2027 (F1–F5 don't
  resolve until 2027–2028).
- **Two new dossiers** — one inequality mechanism (IM2 or the highest-edge node)
  and one democratic-backsliding leverage point, so the module spans domains and
  claim kinds. Each: steel-manned pro + con with real landing-page sources, full
  `AgentAttribution`, 3–5 ranked cruxes (`impactScore × uncertainty`), a human
  review pass, reviewer named in the PR. Where resolving a top crux would change
  little, say so ("unresolved — competing dossiers" is a legitimate terminal
  state, `open-questions.md` Q2).

**Verify:** IF1 loads with 5 predictions and `leaveOneOut`/`spread` compute; new
forecasts pass `lint-resolution`; the two dossiers render at `/dossiers/{id}`
with ranked cruxes.

---

## Sequencing, operator actions, and parallel tracks

- **Order:** slice 1 → slice 2 → slice 3a → slice 3b. Each is its own branch off
  a freshly fetched `main` and its own PR; the session log rides the open branch
  (`.claude/rules/workflow.md`).
- **Audit batches 3/4** (`plans/code-quality-audit.md`: type-layer, write-path
  hardening) interleave as maintenance between headline slices — not re-planned
  here.
- **Funding** (`plans/funding-applications.md`) runs in parallel; slices 1 and 2
  materially strengthen the pitch (agent-ready by the industry checklist,
  writable from every major client) and check the "one external consumer" and
  evidence-package items.

**Operator actions (maintainer only — an agent cannot do these):**

1. **Cloudflare dashboard: unblock AI crawlers.** The live block is a managed
   Cloudflare setting, not an in-repo file — an in-repo `robots.txt` alone will
   not un-block crawlers and may be *shadowed* by the managed robots.txt. Disable
   the managed robots.txt / AI-crawler blocking so our file serves, and confirm
   the Sept-15 default-block wave won't re-block the zone (aboard has no ads, so
   the default shouldn't bite — verify). **This gates slice 1's payoff.**
2. **Delete the stale `SITE_URL` build variable** in the Cloudflare dashboard so
   published `@id`s stop pointing at the dead workers.dev host
   (`knowledge/issues.md`).
3. **List the remote MCP server** on the official MCP registry (preview) and
   Smithery after slice 2 deploys.

## Out of scope (per the reflection and the gated roadmaps)

- Competing on forecast accuracy (commodity); optimizing for training-crawler
  *traffic* (the audience is retrieval + session agents).
- OAuth 2.1 flows, GitHub App migration, MCP auto-merge, session-based MCP
  transport / Durable Objects.
- The integrity *enforcement* half — scoring/calibration (no resolved forecast
  until 2027+), Sybil/identity, CIDRE laundering detection
  (`plans/integrity-foundations.md` gated roadmap).
- Any redesign of the claim page beyond links + markdown twin.
