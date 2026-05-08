# Comparison Table

Top systems per category against the dimensions defined in the plan. Cells are concise judgments traceable to entries in `sources.md`. "N/A" means the dimension does not apply with reason; "—" means unverified online and excluded.

## Forecasting & prediction

| Dimension | **Metaculus** | **Manifold Markets** | **Polymarket** |
|---|---|---|---|
| Agent-submittable | Yes — explicit AI Forecasting Tournament with bot template; bots must share code | Yes — full bot-allowed API, multiple production bots; 500 req/min | Yes — REST + WebSocket + SDKs in Python/TS/Rust |
| Machine-readable claim schema | Question objects via API (JSON); resolution criteria are free text | JSON for markets, bets, comments; resolution as enum | Markets/events/tokens; tokenized order book in JSON |
| Provenance / citation enforcement | Soft — comments may cite, no enforcement | None enforced | None — financial market, not claim-substantiation |
| Falsifiability / resolution | Strong — explicit resolution criteria + dates; admin-resolved | Creator-resolved (controversial); market types: binary, MC, numeric | UMA optimistic oracle (real-money settlement) |
| Calibration / reputation | Per-user Brier, peer score, baseline score; track records public | Trade-weighted Brier (~0.17 platform); per-bot calibration pages | PnL ranking; no published Brier |
| Causal structure | None | None | None |
| Adversarial process | Comments only; no enforced steel-manning | Comments + arbitrage incentives | Pure price discovery |
| Cross-module integration | None — forecasting only | None | None |
| Action / decision interface | Used by some policy/research orgs informally | Mana-economy stakes; no real-world action | Real-money outcomes drive interpretation but no built-in action loop |
| Failure modes observed | Question-quality variance; resolution disputes; thin markets | Creator-resolution gaming; mana inflation; thin markets | Manipulation of low-volume markets; oracle disputes |

## Structured knowledge & causal models

| Dimension | **Wikidata** | **Our World in Data** | **DAGitty** |
|---|---|---|---|
| Agent-submittable | Yes — bot framework is a first-class concept | Read-only programmatically (Charts/Tables/Indicators/Search APIs); contributions via internal team | Browser GUI + R package; programmatic graph creation |
| Machine-readable claim schema | RDF triples; statements with qualifiers and references | CSV + JSON metadata; semantic-search indicators | DAG model definitions in plain text / R |
| Provenance / citation enforcement | Strong — every claim can carry source references and rank | Strong — each chart cites primary sources | N/A — formal model, not an empirical-claim store |
| Falsifiability / resolution | N/A — encyclopedic facts, not predictions | N/A — descriptive indicators, not predictions | N/A — formal causal structure, not predictions |
| Calibration / reputation | Edit history per user; no Brier | N/A | N/A |
| Causal structure | Weak — relations are typed but not causal | None — descriptive only | Strong — purpose-built for causal DAGs and adjustment sets |
| Adversarial process | Talk-page editorial conflict; no formal protocol | Internal editorial review | N/A |
| Cross-module integration | None natively; widely *consumed* by other systems | None — pure data publisher | None |
| Action / decision interface | None | Linked from policy docs, journalism | Identifies confounders for empirical studies |
| Failure modes observed | Vandalism; coverage bias; claim-without-source | Indicator selection bias; lag from primary sources | Limited adoption outside epidemiology; no shared library of canonical DAGs |

## Adversarial reasoning & debate

| Dimension | **Kialo** | **Pol.is (vTaiwan)** | **AI Safety Debate (Irving 2018)** |
|---|---|---|---|
| Agent-submittable | No public API; community parsers exist (CSV/JSON export) | API exists; participants typically humans; bots not the design target | Research protocol — agents *are* the participants by design |
| Machine-readable claim schema | Tree path notation `[n1].[n2]...[nr]`; export via parsers | Statement + vote vectors; cluster outputs | Statement-by-statement transcript; judge label |
| Provenance / citation enforcement | None enforced | None enforced | N/A (research framework) |
| Falsifiability / resolution | None — debates are open-ended | Surfaces consensus statements but no truth-resolution | Human-judge verdict; not empirical resolution |
| Calibration / reputation | Argument upvotes; no calibration | Cluster membership; no calibration | N/A — protocol-level |
| Causal structure | Pro/con tree only | None | None |
| Adversarial process | Built-in pro/con structure | Implicit via clustering; no adversarial pairing | Explicit adversarial — two agents debate before judge |
| Cross-module integration | None | None | None — protocol, not a deployed system |
| Action / decision interface | None | Strong in vTaiwan: 80% of issues 2015–18 led to government action | Theoretical |
| Failure modes observed | Argument fragmentation; karma-style biases; no resolution | Limited to deliberation; no falsifiability layer | Debate may be exploited by capable agents to mislead judges (open research problem) |

## Civilizational-risk & systemic-issue tracking

| Dimension | **IPCC** | **V-Dem** | **Climate TRACE** |
|---|---|---|---|
| Agent-submittable | No — multi-year human assessment cycle | No — expert survey + central coding team | No agent submissions; data is generated by ML pipelines run by the coalition |
| Machine-readable claim schema | Calibrated language (likelihood + confidence) but report-form, not structured records | Indicator codebook + datasets (Stata, CSV, R) | Per-source emission records with metadata |
| Provenance / citation enforcement | Strong — every claim back-cites peer-reviewed lit | Strong — each indicator's coding rules documented | Strong — methodology per sector published |
| Falsifiability / resolution | Implicit via later assessment cycles | Re-coded annually | Updated monthly with 2-month lag |
| Calibration / reputation | "Likely" / "very likely" vocabulary anchors probabilities; per-claim, not per-author | None (institutional authorship) | N/A (institutional output) |
| Causal structure | Free-text causal discussion | Implicit in indicator design (e.g., regime-transformation episodes) | None |
| Adversarial process | Government review rounds; no agent-style adversary | Multiple coders per claim with reconciliation | None |
| Cross-module integration | None | None | None |
| Action / decision interface | Direct input to UNFCCC, national policy | Used by Freedom House, EIU, academic policy | Cited in COP advocacy; corporate disclosure |
| Failure modes observed | 6–7 year lag; consensus pressure can flatten dissent | Coder bias; small-N coding for some indicators | Sectoral coverage gaps; ML inference uncertainty |

## Agent-to-agent / machine-readable substrates

| Dimension | **Schema.org ClaimReview** | **MCP** | **A2A** |
|---|---|---|---|
| Agent-submittable | Producers publish JSON-LD; consumers index it | Servers expose tools/resources; clients (often agents) call them | Designed for agent-to-agent task delegation |
| Machine-readable claim schema | Yes — exactly the use case | Tool/resource descriptions; not claim-shaped | Task/message/artifact objects; not claim-shaped |
| Provenance / citation enforcement | `author`, `itemReviewed`, `url` fields are mandatory in spirit | Out of scope | Out of scope |
| Falsifiability / resolution | `reviewRating` is the resolution; no time-boxing | N/A | N/A |
| Calibration / reputation | None | None | None native; could be layered |
| Causal structure | None | None | None |
| Adversarial process | None | None | None native; could host adversarial agents |
| Cross-module integration | Used by Google fact-check explorer; consumed widely | Adopted across major AI clients | Linux Foundation governance; >100 vendor commits |
| Action / decision interface | Surfaces fact-checks in search | Drives tool execution | Drives multi-agent task execution |
| Failure modes observed | Spec compliance varies; gaming for SEO; rating granularity loss | Adoption uneven; auth/security still maturing | Very new (2025 launch); ecosystem still forming |

## Adjacent: governance & action loops

| Dimension | **Snapshot** | **ResearchHub / ResearchCoin** | **80,000 Hours problem profiles** |
|---|---|---|---|
| Agent-submittable | Wallet-signed proposals possible programmatically | API not surfaced; humans submit reviews and earn RSC | No — editorial publication |
| Machine-readable claim schema | Proposal + voting-strategy JSON; results queryable | Articles + reviews; bounty objects with on-chain settlement | Free-form prose with implicit Scale × Neglectedness × Tractability scores |
| Provenance / citation enforcement | None for proposal content | Reviews link to source paper | Strong — every claim cited |
| Falsifiability / resolution | Vote outcome resolves the proposal | Community-upvote weighting on reviews | None |
| Calibration / reputation | Token-weighted (often quadratic options); not predictive | Cumulative RSC = reputation | None |
| Causal structure | None | None | Implicit via prioritization framework |
| Adversarial process | Proposal-debate forums (off-platform usually) | Open peer review with bounties | Internal editorial |
| Cross-module integration | None | None | None |
| Action / decision interface | Direct execution via Snapshot X (on-chain) | Funds research bounties | Drives EA career choices and grant-making |
| Failure modes observed | Plutocracy via token-weighted votes; voter apathy | Sybil resistance via reputation; small ecosystem | Subjective scoring; insular audience |

## Cross-cutting observation

No single system fills every row strongly. The closest combinations:

- **Metaculus + Wikidata + Kialo** would cover prediction + structured-claim + debate, but with three siloed schemas, three identity systems, and no shared provenance graph.
- **MCP + A2A + (a hypothetical claim ontology like AIF)** would give an agent-first substrate, but no anchor system has yet adopted such a stack for civilizational reasoning.
- **Climate TRACE** is the only existing example of *machine-generated, source-cited, structured claims at civilizational scale* — but only for emissions, and not LLM-agent-driven.
