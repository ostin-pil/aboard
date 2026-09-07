# plans/

Project-level plans for follow-up work. Each file is a self-contained brief a
future session can execute without re-deriving context. Sorted roughly by the
order they could be picked up; pick any.

## Priority order (2026-09-07)

Set by `reports/2026-09-07-state-audit.md`, the first audit after the
late-August break. It supersedes the two orderings below for near-term
work; they stay as the record of how the plans relate. Ranked by what
each item unblocks, then by how long it has already waited.

**Now, operator time, days not weeks**

1. **Glama listing and badge, answer #12962.** The awesome-mcp-servers
   maintainer asked on 2026-09-07 for the Glama claim and score badge.
   The runbook is `distribution-listings.md` §"Runbook", landed on
   `main` in session 76: run it. About twenty minutes in a browser,
   except step 0, which is only needed if `mcp-server/` or the
   `Dockerfile` changed since 2026-08-29.
2. **Settle the launch-post version, then post.** Two versions exist
   (committed, and an uncommitted rewrite in the primary checkout that
   drops the fact-check block). Pick one, keep the fact-check record
   somewhere a future session can find it, re-state the telemetry
   sentence against the audit's section 3, and post before the Fall
   FutureEval announcement, which was still unpublished on 2026-09-07.
   Then the link-backs (`content/about.md`, `README.md`).
3. **Identify the 1,150-a-day `mcp_probe` client** before posting if it
   takes under an hour, after if not. It is a `POST` handshake every
   ~75 seconds that never calls a tool; a health checker's cadence. The
   post makes a claim about anonymous readers, and the probe rows are
   what a reader would check it against.

**Next, one session each**

4. **`deps` session.** `next@16.3.4` carries the `sharp` fix for five
   high advisories; take the minor bumps (`@xyflow/react`, `zod`,
   `react`, `tailwindcss`) in the same session behind the full gate and
   the canvas browser pass. Majors (`typescript` 7, `vitest` 5,
   `eslint` 10, the two model SDKs, the OAuth provider) are each their
   own decision; none is urgent.
5. **Post-launch measurement.** Seven-day totals of `mcp_call`, `twin`
   and `proposal` against the week of 2026-08-30 (191 reads), stating
   the 2026-09-05 cliff. Record the numbers whatever they are, in the
   log of the session that reads them.
6. **Records sweep.** Retire or redirect `HANDOVER.md` (its next action
   shipped in session 34); one pass over `research/open-questions.md`
   to record the answers Q3, Q6 and Q7 already have; close the
   `plans/`-versus-logs question, which is done below.
7. **`proposal-dry-run.md`.** Half a day, no prerequisite, and it is the
   first thing a bot builder arriving from the post will want: a way to
   exercise the write path without opening a pull request.

**Then, in the order the table below already gives**

8. `integrity-foundations.md` enforcement half, scoped first.
9. `organic-traffic-dual-ux.md` §6; §5 is calendar-blocked.
10. `signals-substrate.md`, which unblocks `news-layer.md` and
    `agent-social-layer.md`.
11. `cross-domain-claim-drag.md`.

Calendar-blocked, no work brings them forward: `funding-applications.md`
(first resolution 2027-01-31) and the FLF outcome (unannounced on
2026-09-07).

**What `plans/` is, settled.** Sessions 72 to 75 each carried the
question of whether `plans/` records what shipped or the session logs
do, and each answered it by editing `plans/` to catch up. That is the
answer: the session logs are the record of what happened; `plans/` is
the record of what is still open; a plan's Status section is the one
part of it expected to stay true, and the session that closes work
edits it in the same PR, as `audit-2026-08.md` already requires for its
own rows. The item is no longer carried.

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
| [audit-2026-08.md](audit-2026-08.md) | 8 of 9 chunks done. Chunk 8's build half closed in session 74; posting is priority 2 above. Its telemetry baseline moved on 2026-09-05 (reads fell from ~35 to ~2 a day), so the measurement half compares seven-day windows and names the cliff | One: which launch-post version is canonical | None |
| [distribution-listings.md](distribution-listings.md) | ~20 min operator, priority 1 above: the Glama server listing, then the badge on #12962, which the maintainer asked for on 2026-09-07. npm, registry and Search Console are done | None; the runbook decides the steps | None: the runbook landed in session 76 |
| [integrity-foundations.md](integrity-foundations.md) | do-now slice shipped (session 34); enforcement half unscoped | Decisions taken; see its Status, whose two open lint findings have since been superseded rather than edited | Enforcement half was gated on the MCP write path, which is now met |
| [cross-domain-claim-drag.md](cross-domain-claim-drag.md) | ~half-day | Yes — extent strategy, confirm UX, coordinate math | None |
| [organic-traffic-dual-ux.md](organic-traffic-dual-ux.md) | ~1 day: §5 and §6 only. §1–§3 all shipped (its Status; §2's Worker negotiation landed in `3ecace2`, which that Status used to deny), §4 has since landed (per-page `alternates.canonical`, the ensemble median on the OG card), and §7's Worker instrumentation landed as audit chunk 4 in session 60 | Light — leaderboard timing, feed granularity | First resolution for §5's leaderboard; rest none |
| [agent-distribution.md](agent-distribution.md) | ~2 days (operator + writing); §1 done in session 33 and §2 overlaps `distribution-listings.md` | Light — dataset home, post timing | None outstanding: §5's MCP OAuth landed in session 31 and §7's instrumentation in session 60 |
| [proposal-dry-run.md](proposal-dry-run.md) | ~half-day | Light — flag shape on the envelope | None |
| Dependencies (no plan file; `reports/2026-09-07-state-audit.md` §1) | ~half-day: `next@16.3.4` for the five `sharp` advisories plus the minor bumps, full gate and a canvas browser pass | Majors only; none taken in that session | None |
| Records sweep (no plan file; audit §1 and §6) | ~1 hr: `HANDOVER.md`, `research/open-questions.md` | None | None |
| [signals-substrate.md](signals-substrate.md) | ~1 day | Medium — D1 vs KV, retention, MCP exposure | None — its MCP OAuth prereq landed in session 31 |
| [news-layer.md](news-layer.md) | ~1–2 days + sweep cadence | Medium — filter rule, sweep tuning | signals-substrate (unbuilt); integrity-foundations' enforcement half |
| [agent-social-layer.md](agent-social-layer.md) | ~1–2 days | Medium — endorsement subjects, page naming | signals-substrate (unbuilt) |

The 2026-07-11 suggested order is now spent: every link in it has shipped
except `integrity-foundations`'s enforcement half, and the FLF entry went in
before its deadline. `audit-2026-08.md`'s Suggested order governs near-term
work, and what it has left is chunk 8's operator half (post, link back,
measure); chunk 7 closed in session 73. Of the four pre-review plans that
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
