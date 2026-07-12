# aboard: an agent-first claim graph as the structure and assessment layer of the epistemic stack

*Draft submission to the FLF Epistemic Case Study Competition. Working copy lives in the aboard repo; the live demo is the anchor system. Target: 10 pages or fewer, excluding appendices.*

## 1. What this is, in one paragraph

aboard is a small, working, agent-first registry of falsifiable claims about contested questions. Every claim is a Markdown/YAML record validated against a published schema and served as JSON-LD at a stable URL, and every claim, forecast, and debate position carries machine-readable provenance: which model, which prompt, when. Three modules sit over one shared claim graph. Time-boxed forecasts use open-weights ensembles whose disagreement is measured rather than hidden. Causal problem-trees run symptom → mechanism → leverage point. Steel-manned dual-dossiers pair a pro thesis and a con thesis with cruxes ranked by impact times uncertainty. aboard is deliberately positioned as the structure and assessment layers of the epistemic stack. It is not another ingestion pipeline, and it is not a verdict machine.

The competition asks for tooling that helps people conduct *reliable* epistemic investigations and build *trustworthy* knowledge bases. aboard's bet is that the reliability of a knowledge base is determined less by how confidently it answers and more by three things it can be engineered to guarantee: provenance on every claim, structure that makes disagreement legible through typed causal edges and ranked cruxes, and an honest assessment discipline that terminates in an external anchor rather than in the graph's own opinion. This document argues that case, shows it on the egg-health case, and is candid about where the approach is weakest.

## 2. The load-bearing result: trust terminates outside the graph

The single most useful thing we can contribute to this competition is not the interface. It is a design constraint we arrived at the hard way and can now state cleanly:

> **Integrity, adjudication, and Sybil-resistance are one problem. Every defense that empirically resists gaming terminates in an external, real-world anchor that lives outside the agent graph.**

Three independent lines converge on it. Proper scoring rules (Brier or log) only discipline forecasters *because* each question resolves against a real outcome. Citation-cartel detection (CIDRE) is validated only by predicting an *external* label, journal suspensions, not by anything internal to the citation network. Prediction markets become measurably harder to manipulate only when an *external* probability source exists; money and arbitrage alone do not self-heal manipulation. And Sybil resistance is *impossible* inside the graph alone (Douceur): without a scarce external anchor, meaning a real human or a real-world ground truth, cheap identities capture any purely internal trust mechanism.

For a *trustworthy knowledge base* this is decisive and directly actionable:

1. **Anchor everything you can to reality.** Forecasts resolve against outcomes. Descriptive claims cite primary sources on a curated allow-list, never other agents. Provenance is mandatory and machine-checkable.
2. **For the questions that have no external resolver, which is most contested causal and normative claims, do not manufacture a verdict.** Make *"unresolved: competing dossiers"* a first-class, legitimate terminal state, and make the *structure* of the disagreement (the ranked cruxes, the evidence each side would update on) the deliverable. A confident wrong answer is worse than a well-structured open question.

This is the opposite of a system that tells you whether eggs are bad for you. It is a system that shows you exactly what the disagreement is made of, what would resolve it, and who said what on what evidence. That is what a careful reasoner actually needs on a genuinely open question, and it is what is missing from both the "eggs cause heart disease" headlines and the "eggs are fine" rebuttals.

## 3. The mechanisms, as a reliability toolkit

**Provenance as a hard requirement.** Every authored object carries an `AgentAttribution` (model, prompt title, timestamp); the schema rejects claims without it, and sources must be real landing-page URLs. This makes the knowledge base auditable by construction, because you can always ask who produced this and on what basis, and it is the precondition for any later trust computation.

**Typed causal structure.** Claims are typed (symptom, mechanism, leverage point) and linked by typed edges (`causes`, `moderates`, `reduces`) that each carry a rationale. This turns a pile of assertions into a traversable graph where "what causes what, and how strongly" is explicit and checkable rather than buried in prose.

**Ensemble disagreement as a measured signal.** Where a claim carries a forecast, aboard runs several open-weights models on an identical prompt and reports the *spread*, not just the median, with leave-one-out and simulated-N diagnostics. In the live corpus, one forecast (F4) shows three models clustering at 0.40 to 0.42 while a fourth returns 0.65, widening the spread from 0.02 to 0.25. The same numbers admit two defensible readings, false consensus versus outlier dominance, with different next actions. aboard renders both rather than averaging them away.

**Dual-dossiers with ranked cruxes.** For a contested claim, two steel-manned positions are recorded side by side, each with its own cited sources, plus a ranked list of cruxes: the specific empirical questions whose resolution would move the disagreement, scored by impact times uncertainty. This is the adversarial-collaboration protocol rendered as data.

**One published schema, agent-consumable.** All of the above serialize to JSON-LD against a versioned JSON Schema, served over an open, CORS-enabled API and (in progress) an MCP server, so other agents can read the graph *and*, via a gated and human-reviewed write path, propose additions. The schema is the interoperability contract: another investigation can adopt the claim, edge, and crux shapes without adopting our platform.

## 4. Worked example: the health effects of eggs

We modelled the competition's open-ended case directly in aboard (domain `epistack_cases`, live in the demo). It is a near-perfect instance of aboard's thesis, because the honest state of the evidence is *genuinely unresolved*.

**The problem-tree (three linked claims).**
- **Symptom (`ECS1`, confidence 0.85):** public dietary guidance on eggs has reversed repeatedly for five decades, from cholesterol caps, to the 2015 US Dietary Guidelines dropping the 300 mg/day limit, to renewed caution after the 2019 JAMA pooled analysis, eroding trust in nutrition science.
- **Mechanism (`ECM1`, confidence 0.40, contested):** habitual egg consumption meaningfully raises cardiovascular-disease risk in the general population.
- **Leverage (`ECL1`):** confounder-controlled, pre-registered designs (harmonized individual-participant reanalysis, or an RCT on hard endpoints) resolve the question faster than another observational cohort that inherits the same confounding.
- The edges are explicit: the *unresolved* mechanism `causes` the guidance whipsaw (the symptom), and the better designs `reduce` the confounding uncertainty that keeps the mechanism contested.

**The dual-dossier on `ECM1`.** Two steel-manned positions, each cited:
- **Pro (harm is real):** a plausible LDL mechanism in hyper-responders; the 2019 JAMA pooled individual-level analysis of six US cohorts found a dose-response (+6% CVD, +8% mortality per half-egg/day); reassuring meta-analyses that adjust for serum cholesterol may be adjusting away the causal pathway.
- **Con (no meaningful general-population effect):** the 2020 BMJ analysis (three cohorts plus a 1.72-million-participant meta-analysis) found no association after adjustment; a 2020 dose-response meta-analysis found up to one egg/day unassociated; the 2015 Guidelines dropped the cholesterol cap; and in the very study most cited for harm, the dietary-cholesterol association vanished after adjusting for eggs and red meat, a fingerprint of confounding.
- **Three ranked cruxes**, the top one (impact 0.85, uncertainty 0.70): does a dose-response survive a harmonized, pre-registered confounder set? If it disappears, con is supported; if it survives, pro is.

Notice what the tool did and did not do. It did **not** emit "eggs are fine" or "eggs are dangerous." It produced a navigable, cited, provenance-stamped structure in which the disagreement is *legible* and the resolving experiments are *named and ranked*. For a reasoner or a downstream agent, that is a more reliable input than either confident verdict, and it is reusable: the same claim, edge, and crux shapes carry the two live civilizational domains (democratic backsliding and inequality, with sourced cross-domain edges), which is our generality evidence.

## 5. The four judging questions, answered directly

**Would this actually help someone reason better about this case?** Yes, and in a specific way: it converts a contested question from a rhetorical tug-of-war into a structured object, with steel-manned both sides, cited primary sources, and a ranked list of the experiments that would actually move the answer. On the egg case, a reader leaves knowing not "the answer" but the true shape of the uncertainty and the single most decisive test. That is the reasoning support careful investigators lack today.

**Does it generalize?** The schema is domain-agnostic by construction, because domain is a property of a claim rather than a partition of the code. The same shapes already carry democratic-backsliding and inequality claims, cross-domain causal edges, live forecast ensembles, and now the egg case. A settled case such as LHC black-hole risk is modelled as a high-confidence claim with an external resolution anchor; an open case as a low-confidence claim with a dual-dossier. Nothing in the mechanism is nutrition-specific.

**Does it scale with better AI or more compute?** Monotonically. The ensemble sharpens as models get cheaper and better, through more models, more question-framings, and tighter calibration. Steel-manning and crux-extraction are exactly the tasks frontier models are improving at. And because the output is machine-readable, more compute means more claims curated to the same schema, so the assessment layer improves without a redesign.

**Does it compound?** Yes, and that is the point of a shared graph with a published schema and a gated write path. Each contributor's cited claim, each resolved forecast, and each ranked crux is an addition other people and other agents build on, under attribution. The failure mode we design against, agent slop and citation laundering, is met by the anchor discipline of section 2: primary-source allow-lists, external resolution for forecasts, human-gated write access, and rationale-based rather than count-based review.

## 6. Where this is weakest (the honest section)

- **The anchor is thinnest exactly where aboard is most differentiated.** Forecasts resolve against reality; problem-trees and debate cruxes largely do not. For the non-resolvable modules the only available anchor is human spot-check plus radical transparency. We treat that as a named design boundary, not a solved problem.
- **Structured cruxes are not a convergence machine.** The strongest empirical caution comes from adversarial-collaboration research on AI risk, where resolving even top-ranked cruxes moved a 20-point disagreement by roughly one point. Structure clarifies disagreement; it does not guarantee closure. aboard is built to make non-convergence legible and honest, not to promise convergence it cannot deliver.
- **Adoption, not feasibility, is the risk.** Machine-readable argument schemas have roughly 20 years of precedent (AIF) and little adoption. Our mitigation is to ship the schema *and* the anchor system that produces and consumes it, and to serve agents directly (API and MCP) rather than depend on any one platform's willingness to surface markup, the failure mode that retired ClaimReview overnight in 2025.
- **The corpus is small.** This is a working prototype (tens of claims, curated by hand), not a large knowledge base. The claim here is about the *shape* of a trustworthy knowledge base, demonstrated end to end, not about coverage.

## 7. What we are asking to be judged

Not "aboard has the answer on eggs," because it deliberately does not. Rather: that the *reliable* way to hold a contested question is an attributed, structured, cited claim graph whose assessment discipline terminates outside itself, and that this shape is general, scales with AI, compounds across contributors, and is already running. The egg case is the demonstration; the schema and the external-anchor principle are the transferable contribution.

## Appendices (links, not counted toward the 10 pages)

- **Live demo and graph:** https://aboard.ostin-pil.workers.dev, the egg case under domain `epistack_cases`, alongside the two civilizational domains.
- **Machine-readable API:** `/api/graph` (full JSON-LD graph), `/api/claims/{id}` (single claim with edges, forecasts, and dossier).
- **Schema:** `/schema/v0.json` (authoritative) and `research/schema.md` (human-readable).
- **Egg-case sources (primary):** Zhong et al. 2019 (JAMA); Drouin-Chartier et al. 2020 (BMJ); Sabaté et al. 2020 (Eur J Nutrition); Zhuang et al. 2022 (Circulation); Harvard T.H. Chan Nutrition Source.
- **Method and integrity research:** `research/landscape.md`, `research/agent-first-validation.md`, `research/integrity-anti-gaming.md`, `research/sybil-identity.md` (sources for the section 2 result).
