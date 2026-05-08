# Sources

Every URL fetched or searched during the landscape investigation, with a one-line description of what it provided.

## Forecasting & prediction

- [Manifold Markets API docs](https://docs.manifold.markets/api) — Confirms full bot/agent support: `POST /v0/market`, `POST /v0/bet`, API-key auth, 500 req/min rate limit, market-creator resolution model.
- [Manifold calibration page](https://manifold.markets/calibration) — Platform Brier score (~0.1729 at fetch), trade-weighted calibration plot, ~16-trader threshold for quality predictions.
- [Manifold trading-bot competition + bot list](https://manifold.markets/JamesGrugett/which-bots-will-win-the-manifold-tr) — Active bot ecosystem (Velocity, ArbitrageBot, Botlab, JuniorBot, etc.) with M$ prizes.
- [Polymarket developer docs](https://docs.polymarket.com/) — REST + WebSocket + Python/TypeScript/Rust SDKs; programmatic order placement; UMA-oracle-based resolution (mentioned but not detailed in overview).
- [Metaculus AIB tournament](https://www.metaculus.com/aib/) — Official AI Forecasting Benchmark tournament; bots required to share code/description for inspection.
- [Metaculus bot template](https://github.com/Metaculus/metac-bot-template) — Reference implementation for tournament-eligible AI forecasters; 30-min cycles; uses METACULUS_TOKEN.
- [Metaculus forecasting-tools framework](https://github.com/Metaculus/forecasting-tools) — Production framework for building Metaculus AI bots with aggregation + benchmarking.
- [Good Judgment Open](https://www.gjopen.com/) — Public-facing GJP platform; sponsored challenges (UBS, Economist, HKS); API and bot policy not surfaced on the public landing page (unverified for agent submission).
- [Forecasting Research Institute homepage](https://forecastingresearch.org/) — FRI mandate: forecasting science + automated forecasting tools + policy communication.
- [Existential Risk Persuasion Tournament (XPT) page](https://forecastingresearch.org/xpt) — 80 experts + 89 superforecasters; largest divergence on AI extinction risk; views did **not** converge after months of debate. Public data access via email request.
- [Cultivate Forecasts API reference](https://cultivatelabs.github.io/forecasts-api-docs/) — REST API with OAuth token; powers INFER (US Government forecasting initiative) — agent submissions possible via API but policy unverified.
- [INFER (RAND Forecasting Initiative) about page](https://www.randforecastinginitiative.org/about-infer) — DoD-funded forecasting program; INFER-pub is the public-facing arm.
- [AIA Forecaster technical report (arXiv 2511.07678)](https://arxiv.org/html/2511.07678v1) — LLM forecaster matching superforecaster Brier (0.0753 vs 0.0740 human SOTA) on FB-Market in 2025.
- [Superhuman automated forecasting (CAIS)](https://safe.ai/blog/forecasting) — Independent confirmation that LLM forecasting now beats generic human crowds.
- [AI Agents in Prediction Markets (NYC Servers)](https://newyorkcityservers.com/blog/ai-agents-prediction-market-trading) — Reports 14 of top 20 Polymarket wallets are bots; AI agents = 30%+ of activity, 37% positive PnL vs 7–13% for humans.

## Structured knowledge & causal models

- [Our World in Data — APIs reference](https://docs.owid.io/projects/etl/api/) — Charts API, Tables API, Indicators API (semantic search), Search API; CSV + JSON; Python wrapper `owid-catalog`.
- [Our World in Data — about](https://ourworldindata.org/about) — Joint Oxford / Global Change Data Lab; descriptive datasets, no causal-graph layer.
- [OWID — easier to reuse our data (announcement)](https://ourworldindata.org/easier-to-reuse-our-data) — Recent push to formalize data API and improve programmatic access.
- [Wikidata introduction](https://www.wikidata.org/wiki/Wikidata:Introduction) — Items (Q-numbers), properties (P-numbers), claims with references and ranks; bot edits supported; SPARQL query service.
- [DAGitty.net](https://www.dagitty.net/) — Browser DAG editor + R package; epidemiology focus but applicable across disciplines; GPL-licensed.
- [Squiggle language docs](https://www.squiggle-language.com/) — Probabilistic estimation language; ReScript/JS portable library; Squiggle Hub for sharing models.
- [V-Dem about](https://v-dem.net/about/v-dem-project/) — 600+ democracy indicators since 1789; ~4,200 country experts; five-dimensional democracy framework; multiple downloadable datasets.

## Adversarial reasoning & debate

- [Kialo Wikipedia entry / Hacker News thread](https://en.wikipedia.org/wiki/Kialo) — Pro/con argument trees; CSV/JSON export possible via parsers (e.g., `Kialo-Parser`); no public API; used as NLP training data.
- [Kialo-Parser repo](https://github.com/edoguido/Kialo-Parser) — Community tool to convert Kialo discussions into JSON tree representations.
- [Pol.is + vTaiwan (P2P Foundation Wiki)](https://wiki.p2pfoundation.net/Polis) — Wiki-survey software; semantic clustering of votes; surfaces consensus across factions.
- [vTaiwan case study (CrowdLaw)](https://congress.crowd.law/case-vtaiwan.html) — 26 issues 2015–2018, ~80% led to government action.
- [Adversarial Collaboration Project (Penn)](https://web.sas.upenn.edu/adcollabproject/) — Methodological home for joint-experiment adversarial collaborations.
- [Adversarial collaboration (Wikipedia)](https://en.wikipedia.org/wiki/Adversarial_collaboration) — Kahneman framing: articulate opponent's view, jointly design tests, jointly publish.
- [Mellers, Hertwig & Kahneman (2001)](https://journals.sagepub.com/doi/abs/10.1111/1467-9280.00350) — First named adversarial collaboration; 3 jointly designed experiments on conjunction fallacy.
- [AI Safety via Debate (Irving, Christiano, Amodei, 2018)](https://arxiv.org/abs/1805.00899) — Two agents play zero-sum debate before a human judge; analogy to PSPACE; foundational for scalable oversight.
- [Scalable AI Safety via Doubly-Efficient Debate (2023)](https://arxiv.org/abs/2311.14125) — Theoretical extension giving stronger guarantees on debate as oversight protocol.
- [Argument Interchange Format spec (2011)](http://www.arg-tech.org/wp-content/uploads/2011/09/aif-spec.pdf) — Upper Ontology + Forms Ontology for arguments; designed as machine-readable interlingua.
- [AIF Wikipedia](https://en.wikipedia.org/wiki/Argument_Interchange_Format) — History since 2005 Budapest colloquium; extensions AIF+ for dialogue, sAIF for abstract arguments.

## Civilizational-risk & systemic-issue tracking

- [IPCC about page](https://www.ipcc.ch/about/) — Open expert/government review process; assessment cycles (~6–7 years per AR).
- [IPCC AR5 Uncertainty Guidance Note (PDF)](https://www.ipcc.ch/site/assets/uploads/2017/08/AR5_Uncertainty_Guidance_Note.pdf) — Calibrated language framework: confidence (5 levels) + likelihood (probabilistic terms from "exceptionally unlikely" <1% to "virtually certain" >99%).
- [IPCC calibrated language survey (Climatic Change, 2022)](https://link.springer.com/article/10.1007/s10584-022-03382-3) — Empirical study of how IPCC's calibrated language is interpreted across disciplines.
- [Climate TRACE about](https://www.climatetrace.org/about) — 660M+ emissions sources, monthly cadence, 2-month lag, satellite + sensor + ML pipelines (NOT LLM agents — automated inference).
- [V-Dem data + ERT](https://v-dem.net/about/v-dem-project/) — Episodes of Regime Transformation dataset specifically tracks democratic backsliding episodes.
- [80,000 Hours problem profiles](https://80000hours.org/problem-profiles/) — Scale × Neglectedness × Tractability scoring framework for civilizational issues.
- [CSER (Cambridge)](https://www.cser.ac.uk/) — Existential-risk research centre; TERRA bibliography tool for the field.
- [GCRI](https://gcrinstitute.org) — Global Catastrophic Risk Institute; risk-assessment methodology.
- [Existential Risk Observatory](https://www.existentialriskobservatory.org/) — Public-communications-focused x-risk org.

## Agent-to-agent / machine-readable substrates

- [Schema.org ClaimReview](https://schema.org/ClaimReview) — Machine-readable fact-checking metadata: `claimReviewed`, `itemReviewed`, `reviewRating`, `reviewBody`, `author`, `datePublished`. Consumed by search engines.
- [Model Context Protocol (MCP) introduction](https://modelcontextprotocol.io/introduction) — Open standard for AI-application-to-tool/data-source connections; broad adoption (Claude, ChatGPT, VS Code, Cursor, etc.).
- [Agent2Agent (A2A) protocol](https://a2a-protocol.org/latest/) — Linux Foundation project, open since April 2025; HTTP + JSON-RPC + SSE; complements MCP for agent-to-agent (vs. agent-to-tool) communication.
- [A2A on GitHub](https://github.com/a2aproject/A2A) — Reference implementation and specification.
- [ResearchHub / ResearchCoin](https://docs.researchhub.com/researchcoin/rsc-tokenomics) — Token-incentivized peer review; reviewers paid in RSC; reputation scales with earned RSC.
- [ResearchHub announcement (Nature, 2024)](https://www.nature.com/articles/d41586-024-04027-4) — Reports payment of ~$150 USD-equivalent in RSC per peer review.

## Adjacent: governance & action loops

- [Snapshot docs](https://docs.snapshot.box/) — Off-chain DAO voting platform; gasless via offchain signing; "Snapshot X" variant for fully on-chain (EVM, Starknet); configurable voting strategies.

## Methodological references

- [UK Government — making datasets ready for AI](https://www.gov.uk/government/publications/making-government-datasets-ready-for-ai/guidelines-and-best-practices-for-making-government-datasets-ready-for-ai) — MCP cited as the canonical machine-readable provider standard; provenance + preservation metadata called as critical as ML performance.
