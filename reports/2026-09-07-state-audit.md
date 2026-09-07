# aboard state audit, 2026-09-07

Written on the first day back after a break: the last commit on `main` is `af74ee5` (session 75, 2026-08-29), nine days before this was measured. Everything below was checked against the tree, the live site, npm, the MCP registry, Glama, GitHub and the Analytics Engine dataset on 2026-09-07, rather than read off the session logs. Where a log and a measurement disagree, the measurement is what is recorded.

The prioritized backlog this audit produces lives in `plans/README.md` under "Priority order (2026-09-07)". This document is the evidence for it.

## Verdict

The codebase is healthy and the production surfaces are up. Nothing broke during the break. What the break cost is timing: two operator items that were ready to go on 2026-08-29 are still waiting, and one of them received an external nudge this morning. The single biggest lever is still the one session 75 named, posting the launch post while the FutureEval Fall season is unannounced, and that window is still open today.

Three things need a decision before work resumes, in this order:

1. The awesome-mcp-servers maintainer asked this morning for the Glama claim and score badge. The runbook for exactly that is sitting on an unmerged branch with no PR and no session log.
2. The launch post exists in two versions: the committed one and an uncommitted rewrite in the primary checkout that drops the fact-check block. One of them has to become canonical before anything links to it.
3. The MCP read traffic that the post's measurement plan uses as its baseline fell from around 35 reads a day to around 2 a day on 2026-09-05, three days before this audit. The baseline in session 74's log no longer describes the present.

## 1. Repository health

**Gate.** All eleven commands green on `main` at `af74ee5`, run from a fresh `npm ci`: shellcheck, `check:config`, `tsc`, `lint`, `check:exports`, `typecheck:mcp`, `typecheck:clients`, `lint:resolution --strict`, `vitest`, `build`, `check:built-urls`. knip prints two configuration hints about `tailwindcss` in `ignoreDependencies` and `.css` imports; both are the argued exemptions in `knip.jsonc`, not findings.

**Dependencies.** `npm audit --omit=dev` reports five high-severity advisories, all in `sharp` through `next` (libvips CVE-2026-33327, -33328, -35590, -35591). The fix is `next@16.3.4`, which is outside the pinned range, so it is a deliberate bump with a gate run behind it, not `npm audit fix`. The rest of `npm outdated`, grouped by what a bump would mean:

| Group | Packages | Note |
| --- | --- | --- |
| Patch or minor, low risk | `@xyflow/react` 12.10.2 to 12.11.6, `zod` 4.4.3 to 4.5.4, `react`/`react-dom` 19.2.4 to 19.2.8, `tailwindcss` and `@tailwindcss/postcss` 4.2.4 to 4.3.3, `marked`, `axe-core`, `@types/*` | A `deps` session with the full gate; the React Flow bump wants the browser pass CLAUDE.md asks for on canvas changes |
| Framework | `next` and `eslint-config-next` 16.2.6 to 16.3.4 | Carries the `sharp` fix; read `node_modules/next/dist/docs/` first per `AGENTS.md` |
| Majors, do not take casually | `typescript` 5.9 to 7.0, `vitest` 4 to 5, `eslint` 9 to 10, `openai` 6 to 7, `@anthropic-ai/sdk` 0.95 to 0.124, `@cloudflare/workers-oauth-provider` 0.8 to 0.10, `@types/node` 20 to 26 | Each is its own decision. The two SDK majors only touch `scripts/forecasters/`; the OAuth provider bump touches the live write path |

**Working tree and branches.** Two loose ends from the last day before the break:

- `research/launch-post-2026-08.md` is modified and uncommitted in the primary checkout (64 insertions, 32 deletions). See section 4.
- `feature/session-76-glama-runbook` exists as a worktree with one commit, `d62a442`, a 98-line runbook added to `plans/distribution-listings.md` (the Glama server listing, then the badge, with a podman-verified image build). It has no session log, no PR, and is not in `sessions/`. It is exactly what the maintainer asked for this morning.

**Stale documents** (no commit in 90 days, the manifest's `audit_stale_days`):

| File | Last commit | Assessment |
| --- | --- | --- |
| `research/open-questions.md` | 2026-05-08 | Several questions have de facto answers the doc does not record: Q3 identity (per-agent-codebase, decided in `integrity-foundations.md`), Q6 domain (resolved), Q7 incentives (the launch post states "no stakes, no tokens, no leaderboard" as a position). Worth one pass |
| `research/landscape.md`, `comparison-table.md`, `sources.md` | 2026-05-08 | Reference material; fine to age, but the comparison table predates the remote MCP endpoint and OAuth |
| `plans/cross-domain-claim-drag.md` | 2026-05-21 | Open, still valid, lowest priority in the table |
| `plans/second-domain-cross-domain.md` | 2026-05-11 | Shipped; fine |
| `HANDOVER.md` | content dated 2026-06-12 | Not in CLAUDE.md's file layout. Its "next action" is the integrity-foundations do-now slice, which shipped in session 34. A collaborator reading the root today is pointed at work that is three months done. Retire it or make it point at `plans/README.md` |

**Knowledge base.** `knowledge/issues.md` has three entries still open: undo and redo not refreshing the chrome's node count (session 58), the worktree-without-install `check:exports` gotcha (no fix intended), and the canvas tab order (session 68, waiting on React Flow). The `GET` on `/mcp` entry is resolved as a design question and open as a measurement; section 3 answers the measurement.

## 2. Production surfaces

| Surface | State on 2026-09-07 |
| --- | --- |
| `https://aboard.untype.me/` | 200 in 0.41 s |
| `/api/graph` | 200 |
| `POST /mcp` `tools/list` | 200, nine tools, `list_claims` first |
| `GET /mcp` | 405, as decided in session 72 |
| `/.well-known/mcp.json` | version `0.1.1`, `packages` entry present |
| npm `aboard-mcp-server` | `0.1.1`, last modified 2026-08-24 |
| Official MCP registry | `0.1.1` is `isLatest` with the npm package; `0.1.0` remains as history |
| Glama connector `me.untype/aboard` | 200, claimed, still reporting unhealthy |
| Glama server page `ostin-pil/aboard` | 200, titled "Aboard by ostin-pil". A page already resolves, so the runbook's "submit" step may in practice be a claim of an auto-indexed listing rather than a fresh submission |
| awesome-mcp-servers #12962 | Open. Maintainer comment at 2026-09-07 08:04Z: claim the server on Glama, get the quality score evaluated, add the badge to the entry |
| CI | Last three runs green, most recent the session 75 merge |

## 3. Telemetry

Queried from the Analytics Engine SQL API against `aboard_events`, `SUM(_sample_interval)` throughout.

**By week** (weeks start Sunday, ClickHouse `toStartOfWeek`):

| Week of | `mcp_call` reads | `mcp_probe` | `proposal` | `twin` |
| --- | --- | --- | --- | --- |
| 2026-08-16 | 24 | (not yet counted) | 2 | 3 |
| 2026-08-23 | 94 | 519 | 2 | 5 |
| 2026-08-30 | 191 | 8,204 | 0 | 4 |
| 2026-09-06 (two days) | 3 | 2,001 | 0 | 0 |

**Reads by day since the baseline was taken:**

| Day | Reads | Day | Reads |
| --- | --- | --- | --- |
| 08-29 | 36 | 09-03 | 34 |
| 08-30 | 47 | 09-04 | 42 |
| 08-31 | 6 | 09-05 | 2 |
| 09-01 | 34 | 09-06 | 1 |
| 09-02 | 26 | 09-07 | 2 |

Three observations, none of which the session logs could have made:

- **The reads stopped on 2026-09-05.** From 26 to 47 a day for most of the previous week to 1 or 2 a day since. The tool mix over the period (65 `list_claims`, then 41 or 42 each of the other four read tools) is the signature of a crawler walking every tool evenly, not of a person, so this reads as one automated reader finishing or pausing. Session 74's baseline of "115 reads over twelve days, mean near ten a day" was measured before that reader arrived and after it left is no longer the right comparator. The post-launch comparison should use a seven-day window and state the 09-05 cliff explicitly.
- **The `mcp_probe` counter answers the `GET`/405 question.** Of 10,724 probes, `GET` accounts for 193 and `HEAD` for 17. The other 10,510 are `POST` requests that reached `/mcp` and never became a `tools/call`, most of them from a client the classifier files under `other` (6,974) and the rest from recognised crawlers (3,169). So the reachability cost of the 405 is under 2% of automated traffic, and the interesting number is the other 98%: something initialises against the endpoint roughly 1,150 times a day, about once every 75 seconds, and never calls a tool. That is a health checker's cadence. Identifying it is a query away (`blob1`/`blob2` on the probe rows, then the raw user agent if the counter kept it) and worth doing before the launch post, since the post makes a claim about anonymous readers that a reader could check against these rows.
- **Volume is nowhere near a limit.** Around 1,400 data points a day against a free allowance of 100,000. The probe rows are noise for the eye, not for the budget.

## 4. The launch post

Two versions exist:

| | Committed (`af74ee5`) | Uncommitted, primary checkout |
| --- | --- | --- |
| Words | 1,970 | 1,953 |
| Status and fact-check block | Present: fact-checked 2026-08-28, corrections recorded, telemetry claim measured 2026-08-29, disclosure settled | Removed. The file opens with the rule and the post |
| Style | Longer paragraphs | Shorter sentences, the two readings bolded, some sentences restructured |
| Prose gate | Clean | Clean |

The rewrite is a reasonable copy for pasting into a forum. What it loses is the record of what was verified and when, which is the only thing that lets a future session re-check the post before it goes out. If the rewrite becomes canonical, the fact-check block belongs in the session log that ships it, or above the rule in the file, rather than nowhere.

Re-verified today, unchanged since 2026-08-29: 25 claims (12 democratic backsliding, 9 inequality, 4 epistack cases), 12 forecasts of which F4 and F5 are superseded, 5 dossiers, 3 domains, nine tools in the same order. The one number that has moved is the telemetry sentence, per section 3.

Timing: no Fall 2026 FutureEval announcement was findable today. Summer's questions stopped before September 1. Session 75's inference of an early-to-mid September announcement, extrapolated from Summer's seventeen-day lead, puts the close of the window within days. The case to avoid is still posting after the Fall announcement and competing with it for the same readers.

## 5. Corpus

25 claims, 12 forecasts, 5 dossiers, 3 domains, 3 cross-domain edges. No corpus change since the short-horizon slate landed. The earliest resolution date in `data/` is 2027-01-31 (F9), then 2027-02-28 and four on 2027-03-31. Nothing resolves in 2026, so the leaderboard in `organic-traffic-dual-ux.md` §5 and the funding evidence item in `funding-applications.md` stay calendar-blocked, as `plans/README.md` already says.

The one corpus-shaped gap the audit's verification pass named on 2026-08-17 still stands: no `evidences` edge anywhere in `data/`, and no cross-domain edge touching an `EC*` claim. Neither is urgent; both are the kind of thing a first outside contributor would notice.

## 6. Plans and records

- `plans/audit-2026-08.md` is 8 of 9 chunks closed. Chunk 8 has only operator time left.
- `plans/README.md`'s Open build table was accurate on 2026-08-29 and is updated in the same commit as this report.
- The question carried through sessions 72, 73, 74 and 75, whether `plans/` is the record of what shipped or session logs have become it, has now been carried four times without a decision. The evidence those sessions cite (each edited `plans/` to catch it up) is the answer: the logs are the record of what happened, `plans/` is the record of what is still open, and a plan file's Status section is the only part expected to stay true. `plans/README.md` now says that in one paragraph so the item stops being carried.
- The FLF Epistack outcome (audit M7) is still unannounced as of today. Nothing to record, and nothing to chase.
- `HANDOVER.md` is a point-in-time brief from 2026-06-12 whose next action shipped in session 34. See section 1.

## 7. Method

Gate: the manifest's `build_commands` plus `npm test -- --run`, in order, from `npm ci` on `main` at `af74ee5`. Live checks: `curl` against the site, `/api/graph`, `/mcp` with `GET` and a `tools/list` `POST`, the server card, the two Glama URLs; `npm view aboard-mcp-server`; the registry search endpoint; `gh pr view` on #12962. Telemetry: the SQL API per `worker/README.md`, token from the keychain, never printed. Staleness: `git log -1` per tracked file under `research/`, `plans/`, `knowledge/` and `content/`, threshold 90 days. Prose: prose-mint 0.1.1 over both launch-post versions. External timing: a web search for the Fall FutureEval announcement and for the FLF results, both negative.
