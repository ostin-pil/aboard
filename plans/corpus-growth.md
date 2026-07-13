# Plan: corpus growth — dossiers, inequality ensemble, short-horizon forecasts

Grow the three thinnest parts of the corpus, in order of strategic value: the
dual-dossier module (n=1 — the most differentiated surface, per the 2026-07
landscape review, and the one no competitor ships machine-readably), the
inequality domain's forecasts (zero machine predictions — IF1 has only the
illustrative Opus seed), and a slate of **short-horizon** forecasts so a
resolved-claim track record can exist before 2027 (today's F1–F5 resolve
2027–2028; funders price "who uses/resolved this" over "what it contains").
Effort: ~1–2 days, mostly agent generation + human source review.

## 1. Run the ensemble on the inequality domain (~1 hr)

`scripts/forecasters/ensemble-predict.ts` with the existing
`providers.local.json` (4 live Groq models) against `IF1 --update` —
append-only, same audit-trail convention as F1–F5. Sanity-check with
`scripts/forecast-sanity.ts`. This closes the "half the domains have no
machine forecasts" gap with zero new engineering.

## 2. Two new dossiers (+1 per session thereafter)

Targets (adjust on inspection): one inequality mechanism — `IM2` or the
mechanism with the most edges — and one democratic-backsliding leverage point,
so the module demonstrably spans domains and claim kinds. For each:

- pro + con **steel-manned** positions with real sources (every URL a real
  landing page — CLAUDE.md rule), full `AgentAttribution`;
- 3–5 ranked cruxes (`impactScore × uncertainty` — `cruxRank` already exists);
- human review pass before commit; the reviewer is named in the PR.

Honesty constraint from the research: FRI's adversarial collaborations found
that resolving even top cruxes barely moved beliefs. Dossiers should say what
each crux would *operationally* change if resolved — and where the honest
answer is "little," say so. "Unresolved — competing dossiers" is a legitimate
terminal state, not a failure (`open-questions.md` Q2).

## 3. Short-horizon forecast slate (3–5 questions, resolve ≤ 2027-03)

**Prereq: `integrity-foundations.md`** (the `resolutionSource` /
`resolvedOutcome` / `resolvedAt` fields and the resolution-criteria lint).
New forecasts must carry a `resolutionSource` from day one and pass the lint.

Question shape: concrete metric + threshold + date, resolvable from a T1
source (V-Dem/ERT release, World Bank/WID series update, Freedom House
scores) — e.g. one per existing high-edge mechanism in each domain. Avoid "X
says Y" triggers by construction. Run the ensemble on each at creation so
every forecast ships with 4 model predictions + the seed.

When the first one resolves: populate `resolvedOutcome`/`resolvedAt`, and
compute the first real Brier numbers (the scoring display is gated work in
`integrity-foundations.md`; the *data* starts existing here).

## Positioning note (from the 2026-07 landscape review)

Frame this corpus externally as **the argument-structure layer for machines** —
the thing the fact-checking field said it needs (IFCN convening, 2026-05) and
that ClaimReview doesn't carry — rather than as a forecasting site. aboard
consumes forecast-shaped inputs; it should not compete on forecast accuracy
(commoditizing: ForecastBench extrapolates human parity ~2026-11).

## Verification

1. `npm run build` (loader validates all new data); CI green once
   `repo-hardening.md` lands.
2. IF1 shows 4 Groq predictions + seed; interpretation card renders median /
   spread / leave-one-out for it.
3. Both dossiers render on `/dossiers/[claimId]`; cruxes ranked; all source
   URLs resolve.
4. New forecasts pass `scripts/lint-resolution.ts` with zero warnings.

## Out of scope

- New domains (the FLF entry adds one; don't double up).
- Brier scoring UI (gated in `integrity-foundations.md`).
- Any schema change beyond what `integrity-foundations.md` already specifies.
