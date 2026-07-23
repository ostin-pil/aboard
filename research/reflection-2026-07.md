# Reflection: where aboard is, and where it's going (2026-07-22)

Third reflection round. The first produced `landscape.md` (2026-05-10); the second, `agent-first-validation.md` (2026-06-05). This one takes stock seven weeks later: an internal audit of the running system against three fresh research sweeps of the external landscape (forecasting platforms, epistemics tools, agent-web infrastructure), each run 2026-07-22 with primary-source verification. Status: draft for discussion, not yet a decision record.

## 1. Where we are

**The system crossed the "real" threshold.** aboard.untype.me serves 24 claims, 25 edges (3 cross-domain), 6 forecasts, and 3 dossiers across three domains (democratic_backsliding 12, epistack_cases 3, inequality 9), all published as JSON-LD at stable URLs. The agent write path is live end to end: `POST /api/proposals` accepts all four kinds (claim, edge, forecast prediction, dossier), validates against the published schema, stamps provenance from the caller's credential, rate-limits per token, and opens a PR gated on human review plus CI. The graph already contains content filed this way. Sessions 14 through 25 took the project from local prototype to running public system.

**The FLF entry shipped on time.** Submitted 2026-07-18 against the 07-19 deadline, hosted at `/submission`. Judging is underway now; no results date was announced (verified 2026-07-22).

**Engineering is ahead of content.** Code-quality audit v2 is verified and batches 1 and 2 are merged; 118 tests, clean type-check, prose gate wired into session-end. Meanwhile the corpus has grown by roughly one domain's worth since May. The binding constraint has flipped: the platform is no longer the bottleneck, the content and its consumers are.

**Liabilities found in this round's audit:**

1. **The live robots.txt blocks every major AI crawler.** No robots.txt exists in the repo; Cloudflare's managed one is serving `Disallow: /` to GPTBot, ClaudeBot, CCBot, Google-Extended, Amazonbot, Applebot-Extended, Bytespider, and meta-externalagent, plus `ai-train=no` content signals. For a project whose thesis is agent readability, the front door is closed. This is consistent with Cloudflare's 2026 shift toward default-blocking AI crawlers (see §2.3); the fix is a dashboard setting plus shipping our own robots.txt with a deliberate allow stance.
2. **The discovery surface is still missing:** `/llms.txt` and `/sitemap.xml` both 404. Already planned as the next slice (session 25); the evidence below upgrades and extends it.
3. **No resolved forecast exists.** F1 through F5 resolve 2027 or later, and inequality has no machine forecast at all. Until the short-horizon slate lands and starts resolving, the calibration track record that funders and consumers price cannot exist.
4. **No external consumer.** The one evidence item that distinguishes infrastructure from another well-designed schema (the AIF test from `landscape.md` §12) remains unchecked. The `SITE_URL` dashboard cleanup is also still outstanding.

## 2. What changed outside (seven weeks)

### 2.1 Forecasting: parity arrived, and the bottleneck moved to product

The Forecasting Research Institute declared (2026-07-16) that AI systems have likely reached parity with superforecasters on ForecastBench, with Cassi AI the first to exceed the superforecaster median on market questions. The caveats matter (the human comparison data is 2024-vintage; a fresh human round runs this fall), and Metaculus's own July synthesis of eleven analyses holds the counterline: on live questions, Pro forecasters still beat every bot in all four quarterly comparisons, with no bot improvement trend. But both camps agree on the conclusion that matters for aboard, stated verbatim in the Metaculus synthesis: "the bottleneck is product, not accuracy."

The ecosystem industrialized around that view. Metaculus rebranded its bot program as FutureEval (Feb 2026), with Anthropic, Google, and OpenAI sponsoring credits. A startup tier now sells calibrated forecasts as a service: Cassi AI (gave evidence to UK Parliament), Lightning Rod Labs, Mantic, FutureSearch. ICML held its first dedicated forecasting workshop (Seoul, July 2026). Google DeepMind and xAI submit to ForecastBench directly.

Meanwhile Polymarket spent 2026 in an integrity crisis: a Columbia study found roughly 25% of three years' trading was wash trading, Bloomberg flagged about $200M in possible insider trades, and the DOJ/CFTC filed charges in April. "Agent-heavy" and "manipulable" are now publicly coupled narratives, which strengthens aboard's no-stakes, provenance-first posture.

**Implication.** Calibrated agent forecasts are becoming a commodity input. aboard was never going to win on forecast accuracy, and now it doesn't need to: the open question the whole field just arrived at ("what do you do with calibrated agent forecasts once you have them") is the question aboard's claim graph was designed to answer. Binding commodity forecasts to causal structure, debate cruxes, and resolution rigor is the unoccupied product layer.

### 2.2 Epistemics: agents writing into truth pipelines now works at platform scale

The structural shift of 2026 is that community-notes systems went agentic. Per R Street's June study of X's Community Notes: AI note writers reached majority share (8 AI contributors wrote 50.3% of all visible notes in early May 2026), and AI-drafted notes get rated helpful at twice the human rate. Whatever one thinks of X, this is the existence proof for aboard's core mechanism: agents proposing, humans rating and gating, at scale. Our write path is the same shape with stronger provenance and a schema.

Elsewhere: FLF's competition closed July 19 with a ~$200k pool and an explicit follow-on interest in "incorporating workflows into forecasting and prediction," directly adjacent to aboard's module A. ClaimReview still has no successor (GlobalFact 2026 openly debated whether it has a role at all), so the machine-readable claim interchange slot remains empty. Jigsaw's Sensemaker became the production leader in AI-assisted deliberation (statewide Oklahoma deployment, live-event sensemaking). And a notable near-miss appeared: causal.claims (Garg & Fetzer, v2.0 Feb 2026) auto-extracts evidence-annotated causal claim graphs from ~45k economics papers, machine-readable and graph-native, but retrospective, econ-only, and without forecasts, debate, or an agent API.

### 2.3 Agent-web infrastructure: the checklist now exists, and the timing favors us

Cloudflare effectively published the industry definition of an agent-ready site (April 2026 "Agent Readiness" score, isitagentready.com): discoverability (robots.txt, sitemap), content accessibility (markdown twins per page, llms.txt), bot access control (Content Signals, Web Bot Auth), and capabilities (MCP server cards at `/.well-known/mcp/server-card.json`, OAuth discovery). The same company also moved to default-block AI crawlers for free-plan zones (Sept 15 deadline), which is almost certainly what our robots.txt finding is.

Hard numbers landed on llms.txt: about 9% of top sites publish one, and production crawlers essentially never fetch it (408 requests in 500M+ logged AI bot visits). It serves IDE and session agents, so ship it, but expect no citation lift. Google's first official generative-AI-search guide (May 2026) says the quiet part: no special markup, no llms.txt treatment, just be crawlable and quotable. The WordLift result stands unrebutted and is being productized (Grounding Page Standard): what rewards agent consumption is dereferenceable entity pages with visible facts and navigable links, which is exactly what our claim pages are.

Two timing facts favor the MCP plan. The 2026-07-28 MCP spec goes stateless, making remote servers trivially hostable (Workers included), and ChatGPT has been fully MCP-Apps compatible since February, so one server fronts Claude, ChatGPT, and the IDEs at once. And an April scan found 52% of public remote MCP endpoints dead, so mere reliability differentiates.

Citation dynamics also favor small sites: 60%+ of AI-answer citations come from outside Google's top 10, median time to first ChatGPT/Claude citation is under a week, and each engine needs its own crawler admitted (OAI-SearchBot since OpenAI now runs its own index, PerplexityBot, Google-Extended, ClaudeBot). None of that can happen while robots.txt says no.

### 2.4 The differentiation thesis, re-tested

Both external sweeps ran the falsification check independently: **not falsified as of 2026-07-22.** No system unifies forecasting, causal structure, and adversarial debate over one shared, agent-writable claim graph. The near-miss table got more crowded, though, and the convergence pressure is real:

- **Society Library**: LLM-automated debate maps with provenance, "weaving in more epistemological paradigms in 2026." Add a forecast layer and an agent API and they are the nearest competitor.
- **causal.claims**: automated claim-graph extraction at 45k-paper scale, proving the ingestion layer is automatable.
- **paper.json** (arXiv 2605.16194): typed claim relations (supersedes/strengthens/contradicts) for agent coordination, the convention emerging independently.
- **FLF's epistemic stack**: the closest conceptual frame, currently a funding program in search of running systems, judging entries right now.

The slot is still open. The window is visibly narrowing.

## 3. The strategic read

1. **Open the front door before anything else.** The robots.txt block undermines every other goal: no citations, no agent retrieval, no external consumer can happen through a closed door. The fix is small (dashboard + repo robots.txt + permissive Content Signals) and unblocks the rest.
2. **The discovery slice is validated, and grew.** Everything session 25 ranked first (canonicals, sitemap, robots, llms.txt) is confirmed by the evidence, with two cheap additions: markdown twins for claim pages (aboard is markdown-native, so this is nearly free) and the Agent Readiness score as an external yardstick to pass.
3. **The MCP server got more valuable and cheaper simultaneously.** Stateless spec, server cards, ChatGPT reach, and a 52% dead-endpoint field to stand out against. It converts the write path from "an HTTP endpoint we documented" into "a tool any major client can discover and call." This is the adoption bet, and the transport timing is as good as it will get.
4. **Forecast commoditization is our tailwind, and resolution rigor is our wedge.** The field says the bottleneck is product. Our product is the substrate that gives commodity forecasts somewhere to live: bound to claims, causal edges, cruxes, and (crucially) resolution criteria that pass a lint. The short-horizon slate plus the first resolutions start the only flywheel that matters.
5. **The external-consumer test now has named targets.** LLM-forecasting researchers who hand-curate resolved questions (the Halawi 90%-filtering wedge), the FLF network (fellowship cohort, continuation funding, their stated forecasting-workflow interest), Society Library (complementary, and better inside the tent), causal.claims (interop experiment: can their extracted claims render in our schema?).

## 4. Where we're going (proposed sequencing)

Updating session 25's list against the evidence:

1. **Discovery surface, extended** (unchanged priority, bigger scope): fix the crawler block (dashboard + robots.txt with allow stance and permissive Content Signals), per-page canonicals, sitemap with truthful lastmod, llms.txt, markdown twins per claim page, refresh `agent-surface.md` (it predates the live write path). Yardstick: isitagentready.com score plus first observed AI-crawler hits in logs.
2. **MCP server v1** (elevated from batch 4): read tools over the graph plus the four propose tools over the live write path, built against the stateless spec, server card at `/.well-known/mcp/server-card.json`, listed on the official registry (preview) and Smithery. This is the "front door for agents" milestone and the strongest demo artifact for funding applications.
3. **Corpus growth with resolution rigor** (unchanged): integrity-foundations' `resolutionSource` fields and the resolution-criteria lint, then the short-horizon forecast slate (resolve by 2027-03) and the inequality ensemble run, then dossier growth. First resolved forecast is the milestone.
4. **Batches 3 and 4 of the audit** (type layer, write-path hardening) interleave as maintenance, not headline work.
5. **Funding track runs in parallel**: FLF result is pending on its own clock; micro-grants (Cosmos, Emergent Ventures, Anthropic Economic Futures via the inequality framing) become materially stronger once items 1 and 2 above exist, since the pitch becomes "agent-ready by the industry's own checklist, writable from every major client."

What we are explicitly not doing, per this round: competing on forecast accuracy (commodity), building for training-crawler traffic (24,000:1 crawl-to-refer; the audience is retrieval and session agents), or shipping schema without consumers (the AIF lesson still governs).

## 5. Watch list

- **FLF results** (no announced date; judging in progress as of 2026-07-22) and their forecasting-workflow follow-on.
- **Society Library** adding forecasts or an agent API (nearest-competitor trigger).
- **ForecastBench fall 2026**: fresh superforecaster round tests the parity claim properly.
- **MCP server cards** merging into the core spec; the official registry going GA.
- **Cloudflare Sept 15** default-block wave (verify our zone settings survive it with the allow stance intact).
- **Metaculus FutureEval** productizing "workflow integration" in a way that grows into a claim graph.

Unverified items inherited from the sweeps are flagged inline in the underlying reports; the load-bearing claims above (FRI parity post, Metaculus synthesis, R Street study, Cloudflare product pages, llms.txt adoption trackers, FLF competition page) were verified against primary sources on 2026-07-22.
