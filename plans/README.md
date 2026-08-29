# plans/

Project-level plans for follow-up work. Each file is a self-contained brief a
future session can execute without re-deriving context. Sorted roughly by the
order they could be picked up; pick any.

## Roadmap (current)

- [proposed-direction-2026-07.md](proposed-direction-2026-07.md) — the active
  sequencing out of the 2026-07-22 reflection (`research/reflection-2026-07.md`).
  Three PR-sized slices in order: **(1) discovery surface** (robots allow-stance,
  sitemap, llms.txt, markdown twins, agents surface) → **(2) remote MCP endpoint**
  (stateless `/mcp` in the Worker + server card) → **(3) corpus + resolution
  rigor** (3a integrity-foundations schema/lint, 3b ensemble run + short-horizon
  slate + 2 dossiers). It orders and reconciles the per-workstream plans below
  (`agent-surface`, `mcp-write-path`, `integrity-foundations`, `corpus-growth`)
  against the verified state of the code, which several of them predate. Three
  of those four have since shipped; only `integrity-foundations` is still open,
  and only its enforcement half.

- [audit-2026-08.md](audit-2026-08.md) — the 2026-08-13 audit round:
  findings in five families (S security, P performance, U untracked debt,
  M distribution, R records) plus nine session-sized chunk plans covering
  them and the carried E-items. Its Suggested order supersedes the
  2026-07-11 ordering below for near-term work: truth batch → security →
  instrumentation → bundle → distribution mechanics → launch post, with
  the exporter/edge-identity, worker-test and small-items chunks
  interleaving freely.

## Open — deadline-driven (from the 2026-07-11 review)

| Plan | Deadline | Effort | Prereq |
| --- | --- | --- | --- |
| [funding-applications.md](funding-applications.md) | Rolling (micro-grants now) | ~1 day writing + evidence package | Evidence items: FLF entry (submitted, see Shipped) and repo-hardening (shipped, see Shipped) both satisfied; one resolved forecast is the only one left — **calendar-blocked until 2027-01-31**, the earliest resolution date in `data/` (F9); no amount of work brings it forward |

## Open — build

| Plan | Effort | Decision-heavy? | Prereq |
| --- | --- | --- | --- |
| [audit-2026-08.md](audit-2026-08.md) | 8 of 9 chunks done. Chunk 7 closed in session 73; chunk 8's build half closed in session 74, leaving only operator time: post, link back, then measure | Decided; nothing outstanding | None; chunk 8's prerequisites were met before it started |
| [distribution-listings.md](distribution-listings.md) | ~1–2 hr, all operator | None left — the card-version question was settled in session 69 (npm and card both at `0.1.1`) | Publishing `aboard-mcp-server@0.1.1` to npm, which needs a 2FA one-time password |
| [integrity-foundations.md](integrity-foundations.md) | do-now slice shipped (session 34); enforcement half unscoped | Decisions taken; see its Status, whose two open lint findings have since been superseded rather than edited | Enforcement half was gated on the MCP write path, which is now met |
| [cross-domain-claim-drag.md](cross-domain-claim-drag.md) | ~half-day | Yes — extent strategy, confirm UX, coordinate math | None |
| [organic-traffic-dual-ux.md](organic-traffic-dual-ux.md) | ~1 day: §5 and §6 only. §1–§3 all shipped (its Status; §2's Worker negotiation landed in `3ecace2`, which that Status used to deny), §4 has since landed (per-page `alternates.canonical`, the ensemble median on the OG card), and §7's Worker instrumentation landed as audit chunk 4 in session 60 | Light — leaderboard timing, feed granularity | First resolution for §5's leaderboard; rest none |
| [agent-distribution.md](agent-distribution.md) | ~2 days (operator + writing); §1 done in session 33 and §2 overlaps `distribution-listings.md` | Light — dataset home, post timing | None outstanding: §5's MCP OAuth landed in session 31 and §7's instrumentation in session 60 |
| [proposal-dry-run.md](proposal-dry-run.md) | ~half-day | Light — flag shape on the envelope | None |
| [signals-substrate.md](signals-substrate.md) | ~1 day | Medium — D1 vs KV, retention, MCP exposure | None — its MCP OAuth prereq landed in session 31 |
| [news-layer.md](news-layer.md) | ~1–2 days + sweep cadence | Medium — filter rule, sweep tuning | signals-substrate (unbuilt); integrity-foundations' enforcement half |
| [agent-social-layer.md](agent-social-layer.md) | ~1–2 days | Medium — endorsement subjects, page naming | signals-substrate (unbuilt) |

The 2026-07-11 suggested order is now spent: every link in it has shipped
except `integrity-foundations`'s enforcement half, and the FLF entry went in
before its deadline. `audit-2026-08.md`'s Suggested order governs near-term
work, and what it has left is chunk 7's operator half (the npm publish, then
the registry) and chunk 8 (the launch post). Of the four pre-review plans that
paragraph called independent, three have since shipped; only
`cross-domain-claim-drag` is still open, and it still interleaves freely.

## Shipped

- [repo-hardening.md](repo-hardening.md) — done, all four sections. `LICENSE`
  (Apache-2.0) and `data/LICENSE` (CC BY 4.0) with the README "Licensing"
  section (`7b3348e`); `.github/workflows/ci.yml`, since grown well past the
  brief; referential integrity as `src/lib/data/integrity.ts` (`17abb87`),
  which also reconciles a file's frontmatter against its directory, a check
  the plan never asked for; and the real vocab namespace in `src/lib/vocab.ts`
  (`c7e5736`), settled in session 17. Moved here in session 70. Its §4 was
  still advertised as "blocked on domain choice" long after
  `aboard.untype.me` went live, which is the stale line that prompted this
  sweep.
- [graph-state-integrity.md](graph-state-integrity.md) — done, session 25
  (PRs #53 and #54), recorded in session 47 as all of sequencing batch 2. N1
  (client-only render), E1 (the landing page never shows the sandbox), E2
  (validated hydrate), E3 (`seedHash` drift notice), E4 (collapse replay on
  undo), N2 (`cleanHandle`) and the route error boundary all verified present.
  The `knowledge/issues.md` entry it was paired with reads RESOLVED. Moved
  here in session 70, three months after it landed.
- [open-weights-forecaster.md](open-weights-forecaster.md) — done, and wider
  than scoped. `scripts/forecasters/` carries `ensemble-predict.ts` with three
  provider adapters rather than the planned OpenRouter-only path; F2 holds the
  Claude seed plus four open-weights models from distinct families
  (`llama-3.3-70b`, `llama-4-scout`, `qwen3-32b`, `gpt-oss-120b`), and the
  inequality ensemble `IF1`–`IF3` ran the same way; `src/lib/forecast.ts` has
  the aggregation; the claim page renders the median, count and spread with the
  individual predictions behind a `<details>`; the OG card carries the ensemble
  median; and `research/schema.md` documents ensemble semantics. Moved here in
  session 70.
- [domain-on-create.md](domain-on-create.md) — done. `NodeEditorModal` has the
  picker with a new-domain sentinel, and its design fork was settled as Option
  A: `saveClaimNode` in `graph-ops.ts` finds or creates the
  `__domain_<domain>` group and slots the claim into its row. `newId` mints a
  domain-prefixed id to match. Moved here in session 70.
- [editor-mode-posture.md](editor-mode-posture.md) — done as Posture 2, the
  recommended one. `/graph` labels the editor as a local sandbox
  (`● local sandbox · not filed`, pointing at the PR-pack export and
  `/about#contributing`), and `content/about.md` says the same in prose.
  Posture 3's real submission flow arrived by another route entirely, as the
  MCP write path and `POST /api/proposals`, so the two coexist rather than one
  replacing the other. Moved here in session 70.
- [agent-surface.md](agent-surface.md) — done. §1 `llms.txt`
  (`src/app/llms.txt/route.ts`), §2 entity-page navigation (a Markdown twin per
  claim and per dossier, plus `/index.md`, `/auth.md` and
  `/.well-known/api-catalog`), §3 the agent instructions page in the
  `## For agents` form the plan allowed rather than a separate `/agents` route
  (`content/about.md:183`), and §4 crawl affordances (`src/app/sitemap.ts`,
  `public/robots.txt`). Residue: the `/agents` route was never built and the
  plan's own decision note allowed either, so the choice is made, not pending.
  Moved here in session 58 after verifying each deliverable exists; the audit
  (R5) found it still listed as open.
- [corpus-growth.md](corpus-growth.md) — substantially done. §1 the inequality
  ensemble ran (`IF1`–`IF3`, multi-model), §2 grew the corpus from 1 dossier to
  5 (`M4`, `L3`, `ECM1`, `IM1`, `IM2`), §3 landed the short-horizon slate with
  six forecasts resolving on or before 2027-03-31 (`F6`–`F9`, `IF2`, `IF3`)
  against a target of three to five. Residue, stated rather than buried: §2's
  "+1 dossier per session thereafter" cadence did not hold and is not being
  tracked as a commitment. Moved here in session 58 (R5).
- [flf-epistack-entry.md](flf-epistack-entry.md) — submitted by the 2026-07-19
  deadline. The writeup-led entry (Fork C) went in: the external-anchor thesis
  and both-readings methodology as the substance, the deployed site as the
  demonstration. The repo carries no confirmation reference or exact submission
  date, and the competition outcome is not yet known, so this records only that
  it was submitted and the deadline was met. The plan file stays for the
  argument it makes, which `funding-applications.md` draws on as an evidence
  item. Recorded in session 53, three weeks after the fact, because nothing in
  the repo had said either way.
- [mcp-oauth.md](mcp-oauth.md) — done, session 31. OAuth 2.1 + PKCE for
  `/mcp`: per-call authorization decisions in `src/lib/mcp/auth.ts`, the
  authorization server co-hosted in the Worker (`worker/oauth.ts`, GitHub as
  identity provider, DCR and CIMD, registration rate-limited), RFC 9728
  metadata, and 401 challenges carrying `WWW-Authenticate`. Deployed and
  verified in production; static agent tokens keep working. Follow-ups live
  in the session 31 log, not the plan.
- [mcp-write-path.md](mcp-write-path.md) — done. The four `propose_*` tools
  went live in sessions 18–20 (`POST /api/proposals` in the Worker, canonical
  Zod validation, server-stamped provenance, native rate limiting, PR-only). The
  remote MCP endpoint that fronts them landed in session 30: a stateless
  `POST /mcp` serving both the `2026-07-28` and `2025-11-25` protocol
  revisions, plus a server card at `/.well-known/mcp.json`. The plan's
  Next.js-API-route design was never buildable under static export and was
  retracted in the file itself. `AgentAttribution`'s schema upgrade (step 7:
  `operator` + `agentId` across type, schema, JSON-LD and docs) landed in
  session 18 (`884c83b`), though the plan carried it as open until session 38;
  OAuth moved to its own brief in [mcp-oauth.md](mcp-oauth.md).

- [content-as-data.md](content-as-data.md) — done, session 29. Editorial prose
  moved to a loaded, validated `content/` tree: `site.md`, `home.md` and
  `about.md` read by `src/lib/content/`, rendered with `marked`. `/about`
  gained the Markdown twin session 28 left out, and `about/page.tsx` went from
  479 lines with 102 inline styles to 137 lines of chrome. The plan's slice A
  (a constants module) was built and superseded within the session. Deriving
  the spread table from `data/` came with it and corrected three published
  numbers that had gone stale against the claim pages.
- [second-domain-cross-domain.md](second-domain-cross-domain.md) — done. The
  `inequality` domain (8 claims: IL/IM/IS) and three cross-domain edges
  (CE1–CE3, each with sourced rationale) are live in `data/`. Cross-domain is
  no longer hypothetical; the plan's "UI option B vs A" question was the only
  light part and the data layer is authoritative.

The fourth open thread — a **richer Agent identity model for ensemble
forecasting** — is referenced inside `open-weights-forecaster.md` as
deliberately out of scope for the prototype. It is no longer blocked: the
write path, OAuth, and the first outside filing (`ECM2`, PR #66) supplied the
access pattern it was waiting on, and the identity *fields* (`operator`,
`agentId`) landed in session 18. What remains is the machinery around them —
operator admission, per-codebase handles, verification — per the gated
roadmap in [integrity-foundations.md](integrity-foundations.md); write that
as its own plan when the work is picked up.
