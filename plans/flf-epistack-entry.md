# Plan: FLF Epistemic Case Study Competition entry — deadline 2026-07-19

Enter the Future of Life Foundation's Epistemic Case Study Competition
(~$200k pool, awards $5k–$50k, continuation funding possible) with aboard as a
**prototype tool implementing the structure + assessment layers of the epistemic
stack**, demonstrated on the competition's own case studies. Submission is a
Google Form at [flf.org/epistack-competition](https://flf.org/epistack-competition/).

**Hard deadline: 2026-07-19** (8 days from 2026-07-11, when this plan was written).
Facts below verified against the competition page on 2026-07-11.

## Context

FLF is soliciting exactly aboard's architecture: "layered infrastructure for
making the provenance, structure, and assessment of knowledge transparent and
traversable at scale," including AI tooling that identifies **cruxes**. Entry
forms include "prototype tools: LLM pipelines implementing one or more stack
layers (ingestion, structure, assessment)." Judging: *would this help someone
reason better about this case? does it generalize? does it scale with better
AI? does it compound?*

The catch: entries are judged against **three provided cases** — COVID-19
origins (framed via the 2024 Rootclaim debate), LHC black-hole risk
(essentially settled), and health effects of eggs (open-ended). aboard's
existing domains don't count as a demonstration; the schema and modules must be
applied to at least one of their cases. "Tooling should be general" — which is
aboard's strength: the claim graph + dossier + ensemble machinery is
domain-agnostic by construction (domain is a claim property, not a partition).

Why the fit is unusually good:

- **COVID origins ≙ the dual-dossier module.** The Rootclaim debate *is* a
  steel-manned two-position dispute with identifiable cruxes — the exact shape
  of `Dossier` (pro / con / ranked cruxes). Non-convergence as a legitimate
  terminal state ("unresolved — competing dossiers") is aboard's honest answer
  to a case that public reasoning notoriously botched.
- **LHC ≙ the resolution anchor.** A settled case demonstrates what
  resolution-against-reality looks like in the schema (and exercises the
  `resolutionSource` fields from `integrity-foundations.md`).
- **Eggs ≙ both-readings ensemble.** Contested nutrition evidence run through
  the open-weights ensemble + interpretation-card machinery (median, spread,
  leave-one-out) is the F4 demo transplanted onto their open-ended case.

## Deliverables

1. **A deployed, navigable knowledge base** ("worked examples … arbitrary size
   but must be navigable"). Deploy aboard to Vercel — this is the carried
   "Vercel deploy" item, now with a forcing function. A public URL is also a
   prereq for the funding plan and fixes the `aboard.example` vocab namespace
   (see `repo-hardening.md`).
2. **One new data domain per case** (or a single `epistack_cases` domain —
   decision below) in `data/`, built with the existing pipeline:
   - COVID origins: claim graph (symptoms/mechanisms of the dispute) + a full
     dual-dossier with ranked cruxes sourced from the public Rootclaim debate
     record. The deep worked example.
   - Eggs: 2–3 claims + one forecast-shaped question run through the live
     Groq ensemble (`scripts/forecasters/ensemble-predict.ts`), rendered with
     both readings.
   - LHC: 1–2 claims marked resolved, demonstrating the external anchor.
     The shallow breadth examples.
3. **The written entry (≤10 pages)**: aboard as structure+assessment layers —
   schema (JSON Schema + JSON-LD), provenance (`AgentAttribution`), typed
   causal edges, dual-dossier + crux ranking, ensemble disagreement as signal,
   the external-anchor design constraint (cite `research/integrity-anti-gaming.md`
   honestly — including that cruxes barely moved beliefs in FRI's adversarial
   collaborations). Appendices: schema spec, MCP read-tool transcript, JSON-LD
   samples.
4. **Single-click code**: the public repo qualifies ("well-documented,
   single-click installable") once `repo-hardening.md`'s LICENSE step lands —
   **do the LICENSE before submitting**; an unlicensed repo undercuts an
   infrastructure entry.

## Suggested schedule (8 days)

- Day 1: decisions below; deploy to Vercel; LICENSE (pull forward from
  `repo-hardening.md`).
- Days 2–4: COVID-origins domain — claims, edges, dossier, cruxes. Human
  review of every source URL (CLAUDE.md rule: real landing pages only).
- Day 5: eggs ensemble run + LHC resolved claims.
- Days 6–7: the 10-page writeup; internal red-team pass against the judging
  questions; `/prose-check` on the writeup.
- Day 8: buffer + submit via the form. Do not submit on the deadline day if
  avoidable.

## Decisions to make before starting

- **One domain or three?** *Recommend one `epistack_cases` domain* with the
  three cases as sub-clusters — cheaper, and cross-case edges are allowed by
  design. New ID prefixes per CLAUDE.md (e.g. `EC…`).
- **Depth allocation** — deep on COVID + shallow on the other two (recommended)
  vs even coverage. The guidance rewards generality, but one convincing worked
  example beats three thin ones.
- **Does `integrity-foundations.md` land first?** Its `resolutionSource` /
  `resolvedOutcome` fields make the LHC demo real instead of prose. It's a
  ~2–3 hr slice — *recommend yes, immediately after the Day-1 items*.
- **Attribution posture** — the entry should state plainly which content is
  agent-generated (all of it carries `AgentAttribution`) and what the human
  reviewed. Radical transparency is the credibility play; don't soften it.

## Verification

1. Deployed URL renders all three cases; graph, claim pages, dossier page.
2. `npx tsc --noEmit` + `npm run build` + `clients/validate.ts` against the
   deployed `/api/graph`.
3. Every source URL in the new domain resolves to a real landing page.
4. Writeup ≤10 pages; every judging question explicitly addressed.

## Out of scope

- MCP write path (mention as roadmap in the writeup; don't build under deadline).
- Any new UI features — the existing surfaces are enough; this is a data +
  writing sprint.

## Even if it doesn't win

The entry doubles as: the first cross-domain-by-design demonstration outside
the two seed domains, a citable artifact for every funding application in
`funding-applications.md`, and reconnaissance — FLF will surface whoever else
is building the same stack.
