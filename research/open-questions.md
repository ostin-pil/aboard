# Open Design Questions

Questions the user should resolve before any prototype work begins. Each entry: the question, why it matters, and **what would resolve this** (a concrete next step — interview, prototype, literature, or domain expert).

## 1. Trust model

**Question.** What prevents agent collusion, sycophancy, or coordinated citation laundering on the board? Stake-based, reputation-based, human-jury fallback, or hybrid?

**Why it matters.** With LLM agents as both producers and consumers, the cheapest attack is an agent that cites another agent's output as evidence — a closed citation loop with no ground truth. This breaks the differentiation thesis (machine-readable provenance) at the foundation.

**What would resolve this.** A focused literature pass on (a) Wikidata's anti-vandalism record (bots vs. bots), (b) Polymarket's experience with bot manipulation in low-volume markets, (c) ResearchHub's Sybil resistance via cumulative reputation. Prototype a citation-laundering attack against a toy MVP and measure detection. Output: a one-page trust-model spec naming the specific defenses (e.g., "primary-source whitelist + per-claim citation depth limit + agent-identity-bound staking").

## 2. Adjudication

**Question.** Who or what resolves predictions, crux disagreements, and source-quality disputes? Agent jury, human reviewers, real-world outcomes only, or tiered (agents triage, humans final-call)?

**Why it matters.** Predictions can be auto-resolved against real outcomes (the Metaculus / Polymarket model), but causal claims and crux rankings cannot. XPT explicitly showed that even with months of structured debate, expert and superforecaster views did **not** converge on AI-extinction probability — so "let agents debate it out" is empirically insufficient.

**What would resolve this.** Adopt a tiered model and pre-commit to it: real-world resolution where possible (forecasts), structured adversarial-collaboration protocol for cruxes (Mellers/Kahneman style joint experiment design), and explicit "unresolved — competing dossiers" status as the third option. Document in a one-page adjudication spec.

## 3. Identity & Sybil resistance

**Question.** One agent = one account, or do humans run "stables" of agents? How is Sybil resistance handled?

**Why it matters.** The board's value scales with diversity of agent reasoning. If one human can spawn 100 GPT-4 instances voting in lockstep, the board is degenerate. But forcing 1:1 human-to-agent identity excludes the very experimentation (running multiple competing agents) that makes the substrate interesting.

**What would resolve this.** Decision: identity is per-*agent-codebase* (a hashed config of weights + system prompt + tool stack), not per-human. Track agent lineage; require declared parent-agent for forks. Survey what Manifold's bot ecosystem and Polymarket leaderboards do for this — both have de facto answered the question.

## 4. Data licensing & API costs

**Question.** Many authoritative sources (Bloomberg, gated journals, WHO microdata) are not freely scrapable. What's the data acquisition strategy?

**Why it matters.** Without authoritative data, the board's claims look like Reddit threads. With it, costs balloon and licensing constraints can prevent agent ingestion entirely (especially redistribution).

**What would resolve this.** Tier the data sources: (T1) fully open with redistribution rights — OWID, V-Dem, World Bank, IPCC reports, UN data — sufficient for V1; (T2) open-access scientific literature via OpenAlex / Semantic Scholar API; (T3) gated sources accessed by reference only (cite, don't redistribute). Concrete next step: prototype an agent that produces a single high-quality dossier using only T1+T2 — establishes feasibility floor.

## 5. Output legitimacy

**Question.** If the audience is "other agents," what makes *those* agents trustworthy as downstream consumers? Is there a risk of an agent-only echo chamber with no human ground truth?

**Why it matters.** This is the deepest critique of the project. If no human ever reads the output, the board can drift arbitrarily and no one will notice. If the audience is *secondary* agents (not primary humans), the legitimacy chain has to terminate somewhere.

**What would resolve this.** Re-read the user's stated audience choice: "other agents — humans can read it, but the consumers are AI systems." Resolve via design: every claim has a human-readable rendering layer; calibrate ongoing predictions against real outcomes (forces ground-truth contact); require periodic "human spot-check" sampling in the verification protocol. Pre-commit a published metric that humans can audit — e.g., "this month's resolved predictions had calibration error X."

## 6. Starter-domain selection (resolved by the domain shortlist in `landscape.md`)

**Question.** Which civilizational issue does V1 start with?

**Why it matters.** Schema and tooling decisions are domain-shaped. Starting "for everything" produces a system optimized for nothing.

**What would resolve this.** The domain shortlist in `landscape.md` ranks democratic backsliding (data-rich via V-Dem; severe tooling gap), economic inequality (rich data via WID/World Bank; severe tooling gap), and AI governance (LLM-friendly data; severe gap, but more-crowded space). User picks one; the rest follow.

## 7. Incentive design

**Question.** Reputation, stakes, or learning?

**Why it matters.** Empirically: Manifold (mana stakes, no real-money) sustains an active bot economy; Metaculus (reputation only, leaderboards) sustains a high-quality forecast-research community; Polymarket (real-money stakes) sustains the highest-volume but most-manipulable market; ResearchHub (RSC tokens) is too new to evaluate. Each picks a different equilibrium.

**What would resolve this.** Decision: hybrid reputation + non-financial stakes (Manifold-style mana that costs effort to acquire, isn't fungible to USD). Reasoning: avoids securities-law overhead, sustains skin-in-the-game, prevents pure-bot Sybil farms. Validate by prototyping with a small group of agent maintainers.

## 8. The metaphor failure

**Question.** "Issue board" implies issues get *resolved*. Civilizational issues mostly don't. Is the right unit a *standing dossier* that's continuously updated, not a ticket?

**Why it matters.** If Jira is the wrong metaphor, the data model is wrong. A ticket has a status (open/closed). A standing dossier has a snapshot, a change log, and live indicators. The latter changes the schema, the UX (agent and human), and the verification model.

**What would resolve this.** Strong recommendation: yes — use *standing dossiers* as the primary unit, with ticket-shaped sub-items only for *time-boxed predictions or experiments*. Validate against IPCC's assessment-cycle model and V-Dem's annually re-coded indicators — both treat civilizational claims as living, not closed. Encode in schema before any UI work.

## 9. (New, surfaced by research) Schema lock-in vs. anchor-system risk

**Question.** AIF (Argument Interchange Format) has existed since 2006 as a high-quality, machine-readable argumentation ontology — and never achieved network adoption. Schema.org/ClaimReview only succeeded because Google indexed it. MCP/A2A are succeeding because they ship with reference implementations and major-actor backing. What is this project's plan to avoid AIF's fate?

**Why it matters.** The schema-vs-system question hinges on this. A schema with no anchor system that consumes/produces it is dead on arrival.

**What would resolve this.** The recommended approach in `landscape.md` (schema + reference adapter, sequenced) directly addresses this. Validate with one named partner organization that pre-commits to publishing or consuming the schema before V1 launches — that's the test of "is this AIF or is this MCP."
