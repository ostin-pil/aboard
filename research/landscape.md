# Landscape & Gap Analysis: An Agent-Filed Civilizational Issue Board

**Audience:** the user (and any future collaborators).
**Purpose:** before any prototype work, document what already exists, where the genuine gap is, and what design decisions remain open. The user's three-module spec — **predictions, problem trees, debates over a shared claim graph**, with *other agents* as the primary audience — is taken as input, not relitigated.
**Companion files:** `comparison-table.md` (cross-system table), `open-questions.md` (resolved-by-decision list), `sources.md` (every URL with a one-line description).

## 1. Executive summary

Six categories of prior art are surveyed: forecasting platforms, structured-knowledge / causal-modeling tools, adversarial-reasoning systems, civilizational-risk monitors, machine-readable agent substrates, and adjacent governance loops. Within each, three to five named systems are documented with concrete capabilities and limitations.

Three findings dominate the rest of the report:

1. **AI agents are already a first-class participant on prediction platforms in 2026.** 14 of the top 20 Polymarket wallets are bots; Metaculus runs an official AI Forecasting Tournament with a public bot template; the AIA Forecaster (Nov 2025) matches superforecaster Brier scores in real-world tournaments. The "agent-first prediction module" is not a future ambition — it is current state of the art in production.
2. **No existing system unifies prediction, causal modeling, and adversarial debate over a shared claim graph.** Each module exists in mature human-first form (Metaculus, DAGitty/Wikidata, Kialo/Pol.is/AIF) and one machine-first precedent exists (Climate TRACE for emissions claims), but their integration — and the agent-native I/O that integration enables — is the genuine gap.
3. **A schema-only deliverable is at high risk of becoming AIF.** The Argument Interchange Format has existed since 2006, is technically excellent, and never achieved network adoption. Schemas that succeeded (Schema.org/ClaimReview, MCP, A2A) all shipped with anchor systems and major-actor backing. The recommended MVP shape addresses this directly (§9).

The report's working hypothesis — that no system covers all three modules with agent-first I/O over a shared claim graph — is **confirmed**: no counterexample was identified during the survey. The differentiation thesis is therefore live and falsifiable: name a system that covers all three, and the thesis dies.

## 2. Method

Primary research was conducted via WebSearch and WebFetch against each system's docs, API references, and (where applicable) academic papers. Every comparison-table cell traces to a URL recorded in `sources.md`. Where the public landing page or "about" content was insufficient (Pol.is, Kialo, Snapshot, Squiggle), search was used as a fallback to surface secondary sources, primarily Wikipedia, GitHub, and academic publications. Three systems were marked "unverified" in the comparison table and excluded from claims that depend on them: GJOpen API surface, Polymarket UMA-resolution mechanics in detail, and Snapshot's voting-strategy execution semantics.

## 3. Forecasting & prediction

The most mature of the three modules. Production-grade systems exist; AI-agent participation is normalized; calibration metrics are public.

**Metaculus** is the flagship community forecasting platform. It runs an official **AI Forecasting Benchmark tournament** with a maintained Python bot template ([Metaculus/metac-bot-template](https://github.com/Metaculus/metac-bot-template)) and a richer framework for production bots ([Metaculus/forecasting-tools](https://github.com/Metaculus/forecasting-tools)). Bot-makers must agree to share code or a description for inspection — a transparency norm worth replicating. Per-user track records (Brier, peer score, baseline score) are public; question-resolution criteria are explicit text written at creation time; admin-resolved.

**Manifold Markets** is the API-first prediction market and the most relevant existing precedent for agent participation. The API is fully bot-allowed, with `POST /v0/market`, `POST /v0/bet`, `POST /v0/multi-bet`, key-based auth, and a 500 req/min rate limit. The platform Brier score (~0.1729 at fetch time, trade-weighted) is published; per-bot calibration plots exist (see `manifold.markets/ArbitrageBot/calibration`). Multiple production bots compete for prizes (Velocity, Botlab, ArbitrageBot). Resolution is creator-controlled — a known weakness because the creator can game outcomes.

**Polymarket** is the highest-volume real-money market (>$44B notional in 2025). It exposes REST + WebSocket + Python/TS/Rust SDKs and uses UMA's optimistic oracle for settlement. Independent reporting in 2025 found that **AI agents represent over 30% of wallet activity, with 14 of the top 20 wallets identified as bots**, and 37% of AI agents profitable versus 7–13% of humans. This is the strongest single empirical signal that agent-driven forecasting is no longer hypothetical.

**Good Judgment Open** carries the lineage from the Good Judgment Project's superforecaster research. Its public site does not surface API or bot policy; treat as unverified for agent participation pending direct contact.

**Forecasting Research Institute** is the research arm rather than a forecasting platform proper. Its **Existential Risk Persuasion Tournament (XPT)** is the strongest empirical evidence for the project's debate problem: 80 experts and 89 superforecasters spent months exchanging written arguments on AI, biorisk, nuclear, and climate extinction probabilities, and **their views did not converge** — particularly on AI risk. The implication for this project is sharp: a "let agents debate it out and we'll see who's right" design is empirically broken on civilizational-stakes questions. Resolution must come from elsewhere.

**INFER (RAND Forecasting Initiative)** runs on Cultivate Labs' platform, which exposes a documented REST API with OAuth tokens. INFER targets US Government policymakers; the public arm `INFER-pub` is open to civilians. Agent submissions are technically possible via the API; policy is unverified.

The 2025 academic state of the art is the **AIA Forecaster** (arXiv 2511.07678), which matches superforecaster Brier scores (0.0753 vs. 0.0740 human SOTA) on real-world tournaments. Independent CAIS work confirms that LLM forecasting now beats generic human crowds. **Bottom line for module A:** the research question is no longer "can agents forecast at human level" — it is "what do you do with calibrated agent forecasts once you have them, and how do you wire them into broader civilizational reasoning."

## 4. Structured knowledge & causal models

The most fragmented category. Three different sub-problems are conflated in the user's brief: (a) descriptive indicators with provenance (OWID, World Bank, V-Dem), (b) general structured-claim repositories (Wikidata), and (c) formal causal models (DAGitty, Squiggle).

**Wikidata** is the closest existing claim-with-provenance substrate. Statements use Q-numbers (items) and P-numbers (properties), can carry references and ranks, and are queryable via SPARQL. Bot edits are first-class — the platform was designed for them. Limitation: relations are typed but not **causal**, and there is no native concept of a *forecast* or a *time-boxed prediction*. As an inspiration for schema design, Wikidata is the right reference. As a substrate to host the project, it is structurally insufficient.

**Our World in Data** has recently consolidated its programmatic surface area: Charts API, Tables API (search), Indicators API (semantic search), Search API. CSV + JSON metadata is downloadable. OWID is the gold-standard *descriptive* indicator publisher — but explicitly not a *causal* layer. For the project, OWID is an authoritative T1 data source agents will pull from, not a substrate to build on.

**DAGitty** is the most mature open causal-graph tool — browser GUI plus an R package. It identifies adjustment sets and instrumental variables for causal inference. Its centre of gravity is epidemiology; there is no canonical library of civilizational-scale causal DAGs. **For this project, DAGitty is the right schema reference for the problem-trees module** (specifically for symptom → mechanism → leverage-point edges), but it is not deployed at the scale or with the data-citation discipline the project requires.

**Squiggle** is a small probabilistic-estimation language used in EA forecasting and policy modeling — `Squiggle Hub` hosts shared models. Its role for this project is *plumbing*: a way for agents to compose, share, and audit Monte-Carlo-style estimates inside problem-tree nodes. It is not a substrate, but it is a strong candidate for a sub-language inside leverage-point nodes that need to express probabilistic intervention effects.

**V-Dem** is the most rigorous democracy-indicator dataset (600+ indicators, 1789–present, ~4,200 country experts). Its **Episodes of Regime Transformation (ERT)** dataset specifically tracks democratic backsliding, including coding rules. V-Dem matters here as both authoritative T1 data and as an inspiration for **how civilizational claims can be coded with provenance and reproducibility**.

**Bottom line for module B:** none of these is a substrate; they are sources and design references. The project's structured-knowledge layer must be built — but the schema can borrow heavily from Wikidata's reference/qualifier model and DAGitty's DAG semantics, with Squiggle inside leverage-point nodes for probabilistic intervention modeling.

## 5. Adversarial reasoning & debate

The least production-mature module, and the one with the largest documented failure mode.

**Kialo** is the best-known structured-debate platform: pro/con argument trees with hierarchical paths. There is no public API, but community parsers (e.g., `Kialo-Parser`) export discussion trees to JSON. The platform has produced training data for argumentation NLP research, but it has no resolution mechanism, no calibration, and no claim-substantiation enforcement — essentially a debate UI without empirical grounding.

**Pol.is** powers vTaiwan and the broader civic-tech consensus-finding ecosystem. Its core mechanism — semantic clustering of statement votes, with elevation of statements that achieve cross-cluster agreement — is elegant and has demonstrated real-world impact (~80% of vTaiwan's 26 issues 2015–2018 led to government action). For this project, Pol.is is a strong reference for **identifying cross-faction consensus among debating agents**, but it is purely opinion clustering — no claim substantiation, no falsifiability.

**The Adversarial Collaboration Project** (Kahneman, Mellers, Hertwig and successors) is the methodological gold standard for productive disagreement: opponents jointly design the experiment that could change either side's mind, and jointly publish whatever the result. The 2001 conjunction-fallacy collaboration ran three jointly-designed experiments. **This is the right protocol shape for the debate module's crux-resolution loop** — agents must commit, in advance, to what evidence would update them, then jointly seek that evidence (or run the experiment if feasible). Implementing this for agents is novel; the protocol is well-defined for humans.

**AI Safety via Debate** (Irving, Christiano, Amodei 2018; extended 2023) frames debate as a *scalable-oversight protocol*: two agents debate; a (cheaper) human or AI judge decides. The 2018 paper proves a PSPACE-completeness analogy under optimal play. This is foundational to the project — but it is a research protocol, not a deployed system. The 2023 "doubly-efficient debate" paper strengthens the theoretical guarantees.

**The Argument Interchange Format (AIF)** is the most relevant cautionary tale in the entire landscape. Conceived in a 2005 Budapest colloquium, formally specified by 2011, AIF is a high-quality machine-readable ontology for arguments — Upper Ontology (graph node/edge types), Forms Ontology (premises, inference schemes, exceptions), and extensions for dialogue (AIF+) and abstract arguments (sAIF). It was designed exactly to be the schema this project needs for module C. **It never achieved network adoption.** The history of AIF should be studied carefully before committing to a schema-only deliverable.

**XPT (treated under module A) is also the binding constraint here:** months of structured exchange did not converge expert and superforecaster views on AI extinction risk. Pure debate without forced empirical resolution is empirically insufficient at civilizational stakes. The implication for the project is the **adjudication question** in `open-questions.md`: when forecast-style resolution is unavailable, the design must explicitly support "competing dossiers, unresolved" as a stable status, not pretend the debate can be closed.

**Bottom line for module C:** the schema is solved (AIF, plus Adversarial Collaboration's protocol shape, plus AI Safety Debate's two-agent + judge structure). The unsolved problems are **adoption**, **resolution when empirics fail**, and **integration with the prediction and problem-tree modules**.

## 6. Civilizational-risk & systemic-issue tracking

The category that most resembles the project's intent — but built for human consumption with multi-year cycles.

**IPCC** assessment reports use the most-developed calibrated-language framework in existence: a five-level confidence scale (very low → very high) and probabilistic likelihood terms ("exceptionally unlikely" <1% to "virtually certain" >99%). Every claim back-cites peer-reviewed literature. The framework is institutional gold standard but not machine-readable: it is *prose with anchored vocabulary*, not structured records. Assessment cycles are 6–7 years per AR. **For this project, IPCC's calibrated language is the right vocabulary anchor for the predictions module's confidence/likelihood metadata.**

**V-Dem** (covered in §4) is the most rigorous social-science indicator dataset and explicitly tracks democratic backsliding. The relevant insight for module B is its *coder discipline*: each indicator has documented coding rules, multiple independent coders per claim, and reconciliation procedures. This is the right inspiration for how problem-tree nodes should be coded reproducibly.

**Climate TRACE** is the precedent worth studying most carefully. It produces machine-generated, source-cited, structured claims about emissions for 660M+ sources globally, updated monthly with a 2-month lag. **It is the single existing example of "machine pipelines producing structured civilizational claims at scale."** It is *not* LLM-agent-driven (the inference is satellite + sensor + classical ML), but the engineering precedent — provenance per source, monthly cadence, sectoral methodology documentation — is directly transferable.

**80,000 Hours problem profiles** publish the Scale × Neglectedness × Tractability framework, currently prioritizing AI risk above other civilizational issues. The framework is subjective and editorially produced, but the **scoring schema itself** is the right starting point for the project's prioritization metadata on issues.

**CSER**, **GCRI**, and the **Existential Risk Observatory** are research-and-advocacy organizations rather than data substrates. CSER's TERRA bibliographic tool is a reference for how a structured x-risk literature corpus can be built; otherwise these are sources to cite, not platforms to integrate with.

**Bottom line for module B (extension):** civilizational-risk tracking is currently a publication category, not a substrate category. Climate TRACE is the only system that demonstrates the engineering shape this project needs (machine-generated structured claims with provenance), and it covers a single domain.

## 7. Agent-to-agent / machine-readable substrates

This category is changing fastest. Three protocols matter:

**Schema.org/ClaimReview** is the most-deployed machine-readable claim format: `claimReviewed`, `itemReviewed`, `reviewRating`, `reviewBody`, `author`, `datePublished`, `url`. It is consumed by Google's fact-check explorer and adjacent search-engine surfaces. **The reason it succeeded where AIF did not is structural: a major actor (Google) committed to indexing it, which created the producer incentive to publish in that format.** This is the single most important historical lesson for this project.

**Model Context Protocol (MCP)** is Anthropic's open standard for agent-to-tool/data-source connections. It is broadly adopted across major AI clients (Claude, ChatGPT, VS Code, Cursor) and is referenced by UK Government AI guidelines as the canonical machine-readable provider standard. MCP is not claim-shaped, but **it is the right transport layer for agents to consume the project's claims**: an MCP server exposing the claim graph would put the substrate inside every major agent client by default.

**Agent2Agent (A2A)** is the Linux Foundation–governed open protocol launched by Google in April 2025 for agent-to-agent communication, complementary to MCP. It is task-message-artifact shaped, not claim-shaped, but it is the natural transport layer for the project's *production* loop — agents delegating evidence-gathering, peer review, or experiment design to one another. With >100 vendor commits and Linux Foundation governance, it is the strongest candidate to become the agent-to-agent layer for the project's adversarial collaboration protocol.

**ResearchHub / ResearchCoin** is the closest active experiment in token-incentivized peer review, paying ~$150 USD-equivalent in RSC per review. Reputation accumulates with cumulative RSC. The DeSci ecosystem at large is too young to draw firm lessons from, but ResearchHub is the right incumbent to compare incentive design against.

**Bottom line for substrates:** the agent transport problem is largely solved (MCP + A2A); the agent-readable claim ontology problem is unsolved at production scale (AIF is the technical answer that nobody adopted; ClaimReview is too narrow). The project's contribution to substrates is therefore the **claim ontology**, not the transport layer.

## 8. Adjacent governance & action loops

**Snapshot** is the dominant DAO governance platform: off-chain proposal + voting via wallet signatures, configurable voting strategies, optional on-chain execution via Snapshot X. The relevant insight for the project is the **proposal → vote → execute** loop, which is the closest analogue to "issue dossier → adjudication → action." But Snapshot is plutocratic by default (token-weighted votes), and the project deliberately avoids token-weighted governance over civilizational claims.

**GitHub Issues / Linear / Jira** are the literal model the user invoked. The relevant lesson is that they work for *bounded, ownable, time-boxable* problems — exactly what civilizational issues are not (`open-questions.md` §8). Adopt the data model (typed records, comments, status, labels), reject the resolution metaphor (closed/open).

## 9. Cross-category synthesis & the differentiation thesis

The original hypothesis to test:

> No existing system is (a) agent-first by design, (b) unifies forecasting + causal models + adversarial debate over a shared claim graph, (c) enforces machine-readable provenance and continuous calibration on every claim. Each of the three modules exists in human-first form; their integration and agent-native I/O is the gap.

**Result of the survey: confirmed.** No system was identified that covers all three modules with agent-first I/O over a shared graph. The closest near-misses are:

- **Metaculus + Wikidata + Kialo** — three siloed schemas, three identity systems, no shared provenance.
- **MCP + A2A + AIF** — would be the right protocol stack, but no anchor system exists that produces or consumes this combination for civilizational reasoning.
- **Climate TRACE** — the only deployed machine-claim-generator at civilizational scale, but single-domain (emissions) and not agent-driven.

**The thesis is falsifiable.** A reader can name any specific system; the comparison table shows whether it covers all three modules with agent-first I/O. The thesis dies on a counterexample. None was found in the survey, but the user should treat this as a standing invitation — if a colleague names one, re-test the thesis.

## 10. The strongest case against building this

In good faith, three counterarguments to the project, with this report's responses.

**Counterargument 1: This will be agent slop.** Civilizational issues are precisely where LLM agents are weakest — long causal chains, contested data, ideological loading. A board of agent-filed issues will fill with confidently-cited nonsense, citation laundering, and motte-and-bailey reasoning, drowning whatever signal exists. The board will lower the average quality of public reasoning, not raise it.

*Response:* This is the most credible objection. It is mitigated, not eliminated, by three defenses already designed into the spec: (1) every claim must trace to a primary source on a curated whitelist (no agent-citing-agent loops); (2) every prediction must resolve against a real-world outcome and contributes to the agent's calibration score, which is public and binding; (3) crux disagreements that cannot be empirically resolved are explicitly marked "unresolved — competing dossiers" rather than getting a synthetic verdict. The mitigation is empirical — measurable — and a small-N pilot in the chosen starter domain (§11) is the test.

**Counterargument 2: AIF already failed at exactly this.** The Argument Interchange Format was designed in 2005 to be the machine-readable substrate for argumentation across systems. It is technically sound and never achieved adoption. Why will this project succeed where AIF did not?

*Response:* AIF was schema-only with no anchor system that produced or consumed it at scale. Schema.org/ClaimReview only succeeded because Google indexed it. MCP and A2A succeed because they ship with reference implementations and major-actor backing. The project's recommended MVP shape (§12) addresses this directly: build the schema **and** the anchor system, sequenced so the anchor system seeds the network effect that the schema needs.

**Counterargument 3: The audience is wrong.** "Other agents" sounds elegant but creates an echo chamber with no human ground truth. If no human ever reads the output, the board can drift arbitrarily. If humans are the *real* audience, the design should be human-first; if agents really are, the legitimacy chain has to terminate somewhere outside the system.

*Response:* Partially conceded. The mitigation is to design the legitimacy chain explicitly: every prediction terminates at a real-world outcome (forces ground-truth contact); every claim has a human-readable rendering; periodic published metrics (e.g., "this month's resolved predictions had calibration error X") make the system human-auditable even if humans are not the primary readers. This does not refute the objection; it constrains the design so that the failure mode is detectable.

## 11. Domain shortlist

The user must pick one starter domain before any prototype work. Three candidates, ranked by *(a) data availability and licensability* × *(b) severity of the existing-tooling gap*, and weighted toward the user's stated concerns (democratic backsliding, inequality, crisis cascades).

### Recommendation 1 — Democratic backsliding metrics

- **Data availability:** Excellent. V-Dem (600+ indicators, 1789–present, redistributable), Freedom House (annual, public), EIU Democracy Index, V-Dem's ERT episode-coding, World Justice Project Rule of Law Index.
- **Tooling gap:** Severe. V-Dem produces the data; nobody integrates V-Dem with prediction markets (no calibrated forecasts on V-Dem-defined backsliding episodes), with causal models (no shared DAG of "what causes V-EM Liberal Democracy Index to drop"), or with structured debate.
- **Why it fits:** Direct alignment with the user's stated concern ("democracy fall-down"). Indicators are already coded with provenance and reproducibility — a near-ideal seed for the problem-tree module. Forecasts on backsliding episodes are tractable (timeframes are months-to-years, not decades).
- **Why not higher risk than it looks:** Politically charged claims invite Counterargument 1 (agent slop at scale). Mitigation: anchor every claim to V-Dem indicator codes; treat V-Dem as the canonical schema, not the agent's interpretation of news.

### Recommendation 2 — Economic inequality

- **Data availability:** Excellent. World Inequality Database (WID.world), World Bank WDI, OECD Income Distribution Database, LIS data, Piketty/Saez/Zucman-style series.
- **Tooling gap:** Very severe. The data ecosystem is mature; the *reasoning* ecosystem is not. There is no platform that integrates inequality data, causal interventions (tax policy, antitrust, labor policy), and structured forecasts on outcomes (e.g., "if X policy passes, will inequality fall on metric Y?").
- **Why it fits:** Direct alignment with the user's "biggest inequality level in modern history" concern. Forecasts are tractable when tied to specific policy interventions.
- **Why not #1:** Causal claims are more contested than democratic-indicator claims; XPT-style non-convergence is more likely. The "competing dossiers, unresolved" status will be exercised heavily — which is informative but harder to demo.

### Recommendation 3 — AI governance and AI risk

- **Data availability:** Mixed. Strong on AI capability evals, lab releases, papers (OpenAlex, arXiv, Semantic Scholar). Weak on outcome data for governance interventions.
- **Tooling gap:** Severe but crowded. Metaculus, Manifold, FRI, AI Safety institutes, EA Forum, LessWrong, AI Impacts already cover much of this surface.
- **Why this is #3:** the field already has substantial agent-friendly infrastructure (Metaculus AI tournament, LLM-friendly literature, well-developed forecast questions). The marginal value of an additional unified board is lower here.

**The user can pick a starter domain from this shortlist alone.** Recommendation: democratic backsliding for the V1 build, with explicit plan to add inequality as the V2 domain.

## 12. Schema vs. system: the explicit recommendation

The user asked: is the highest-leverage MVP an *agent-readable claim schema + reference adapter*, or a *standalone three-module system*?

**Recommendation: both, sequenced — schema-first, system-second, in a single project.**

Reasoning:

1. **Pure schemas die.** AIF is the lesson. A schema with no anchor system that consumes/produces it at scale will not achieve adoption regardless of technical quality.
2. **Pure systems calcify.** A standalone product with a proprietary internal data model becomes a silo no other agent system can interoperate with. The user's stated audience ("other agents") forecloses this option.
3. **The successful precedents are dual.** Schema.org/ClaimReview + Google indexing; MCP spec + Anthropic reference servers; A2A spec + Google reference implementation. Each is a schema **and** an anchor system that produces or consumes it.

Concretely:

- **Phase 1 — schema first (target: 2–3 weeks).** Define the shared claim-graph schema covering predictions, problem-tree nodes (symptom / mechanism / leverage-point), debate dossiers (claim + cruxes + adversarial-collaboration commitments), and per-claim provenance metadata. Borrow from Wikidata's reference/qualifier model, IPCC's calibrated-language vocabulary, AIF's argument-graph node types, and ClaimReview's `reviewRating` shape. Publish as JSON Schema + an MCP server reference implementation. Public from day 1 to invite external contribution.
- **Phase 2 — anchor system (target: 6–8 weeks).** Build the minimal three-module reference platform that produces and consumes the schema, in the chosen starter domain (recommended: democratic backsliding). Ingest V-Dem indicators as seed claims; agents file forecasts, file problem-tree nodes, run adversarial collaborations. Publish calibration metrics weekly.
- **Phase 3 — adoption test.** Recruit one external organization that pre-commits to publishing or consuming the schema. If achievable, the project is on the MCP/ClaimReview trajectory. If not, it is on the AIF trajectory and the design needs to be re-examined.

The pre-committed external partner (Phase 3) is the falsifiable test that distinguishes "we built another well-designed schema" from "we built infrastructure."

## 13. Recommended next step

Do not begin prototype work yet. The next two decisions are sequential:

1. **User picks a starter domain** from the shortlist in §11. (Recommendation: democratic backsliding.)
2. **User confirms the schema-first / system-second sequencing** in §12, or proposes an alternative.

After both are resolved, the next deliverable is a **schema spec** (Phase 1, §12) — not code. The schema spec is small enough to be written in a week, reviewed against the comparison table to ensure it dominates each existing system on the dimensions where the project should win, and circulated to one external reviewer outside the immediate team.

If this report is read end-to-end and either decision (1) is unblocked or (2) the specific question that's still blocking is named, the research phase has done its job.
