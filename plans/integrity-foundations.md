# Plan: integrity foundations — external-resolution anchor + required rationale

The buildable slice of the integrity / anti-gaming design. Full rationale and
sources live in `research/integrity-anti-gaming.md` and `research/sybil-identity.md`.

## Status (2026-07-29)

The do-now slice shipped in session 34. All three changes landed as specified,
with the recommended decisions taken (`Source` reused for `resolutionSource`,
the small `resolvedOutcome` union, warn-only lint). Two things the plan did not
anticipate:

- **`resolvedOutcome` gained an explicit `null` arm** meaning *annulled*, as
  distinct from an absent field meaning *not resolved yet*. Without it, a
  question that turns out to be unresolvable can only sit pending forever,
  which quietly corrupts any future scoring denominator.
- **The backfill stopped at five of six forecasts.** F4 has no external anchor
  to name, and F5's criteria carry no threshold. Both are left flagged rather
  than patched, for the reason in the section below.

The gated roadmap further down is untouched, and its MCP-write-path
prerequisite is now met (sessions 18 to 20 for the write path, 31 for OAuth).

### Why the last two findings stay open

`npm run lint:resolution` reports two findings, and neither should be closed by
editing the forecast:

- **F4 (`no-source`)** asks whether a major platform will voluntarily publish
  ranking parameters. No registry tracks voluntary first-party disclosures, so
  there is no landing page to cite. Naming one would fabricate the anchor the
  field exists to make honest. The real defect is question design, not a
  missing URL.
- **F5 (`no-threshold`)** turns on whether a statute is "binding" and "distinct
  from DSA requirements", which is a judgement boundary rather than a number.
  The lint is being blunt here (a statute passing is a genuine binary event),
  but the boundary really is unstated.

Both are fixable only by rewriting `resolutionCriteria`, and both forecasts
already carry filed predictions. Editing the question after agents have
predicted against it changes what they were predicting and silently
invalidates the record, which is the same class of move the anti-gaming
research exists to rule out. The correct repair is a **new, well-specified
forecast** alongside the old one, which belongs to `corpus-growth.md` §3.
Adding `resolutionSource` to the other five was legitimate precisely because
it adds an anchor without altering the question.

## Context

The three integrity research passes reached one conclusion: **every defense that
resists gaming terminates in an external, real-world anchor outside the agent
graph.** For forecasts that anchor is resolution against a real outcome; for the
graph it is making provenance/rationale first-class.

Reality check that shapes this plan: aboard has **no untrusted-write path yet**
(filesystem CMS; MCP write-access is planned, not built). So the *enforcement*
half — admission gating, identity, Sybil resistance, scoring — is a prerequisite
for MCP, **not** a retrofit, and is gated below. What is worth doing **now** is the
schema layer that carries the external-anchor primitives: the schema outlives the
UI (`vision.md`), and `public/schema/v0.json` is a published contract, so getting
the shape right early is the cheap, high-leverage move.

Note: identity fields on `AgentAttribution` (operator + per-codebase) are
deliberately **not** here. The repo already decided to upgrade `AgentAttribution`
"when we understand the access pattern," in a separate plan (`plans/README.md`;
`open-weights-forecaster.md` out-of-scope). That access pattern comes from the
write path that doesn't exist yet — so identity belongs to the MCP plan.

## Goal

Make the external-resolution anchor explicit in the data model and validate
resolution rigor — without touching write/auth (which doesn't exist). Three small,
independent changes.

## The do-now slice (executable)

### 1. Forecast gets an explicit resolution anchor

- `src/lib/types.ts` — add to `Forecast`: `resolutionSource: Source` (optional
  initially), the external thing that resolves it (third-party URL + concrete
  event); plus `resolvedOutcome` (`"yes" | "no" | number | null`) and `resolvedAt`
  (ISO string), both optional, populated when the forecast resolves.
- Backfill `resolutionSource` for the 5 existing forecasts (F1–F5) in the same PR
  so the corpus stays clean (the "pre-curated falsifiable claims" wedge).
- Ripple, **same commit** (CLAUDE.md rule): `public/schema/v0.json`, `jsonld.ts`
  (serialize the new fields under the `aboard:` context), `research/schema.md`.

### 2. Resolution-criteria lint (reject "X says Y" triggers)

- New `scripts/lint-resolution.ts` (or a loader-time `console.warn`-free logged
  warning): flag `resolutionCriteria` that (a) depend on an individual/group
  *saying* something (`/\b(says?|announces?|declares?|tweets?|states? that)\b/i`),
  or (b) are ill-defined (no concrete metric / threshold / date). Straight from the
  Metaculus checklist (see `integrity-anti-gaming.md`).
- Start as **warn-only** so existing forecasts don't break the build; tighten to
  CI-failing once F1–F5 pass it.

### 3. Make `Edge.rationale` required

- Confirmed safe: all 19 existing edges already carry rationale (democratic 12/12,
  inequality 7/7, cross-domain 3/3). Change `rationale: z.string().optional()` →
  `z.string()` in `types.ts`. This operationalizes "classify on rationale, not on
  edge counts" at the data level — rationale is always present to reason over.
- Ripple: `public/schema/v0.json` (rationale required on Edge), `research/schema.md`.

## Decisions to make before coding

- **`resolutionSource` shape** — reuse the existing `Source` type (label + url +
  kind…) vs a narrower `{ url, concreteEvent }`. *Recommend reuse `Source`*: already
  validated, serialized, and JSON-LD-mapped.
- **Lint severity** — warn-only vs CI-failing. *Recommend warn-now, gate-after-backfill.*
- **`resolvedOutcome` type** — discriminated (`yes|no|number|null`) vs always-string.
  *Recommend the small union* so binary forecasts score cleanly later (Brier needs 0/1).

## Verification

1. `npx tsc --noEmit` + `npm run build` clean.
2. `clients/validate.ts http://localhost:3000/api/graph` passes against the updated
   `v0.json`.
3. All 5 forecasts load with `resolutionSource`; the lint flags a deliberately-bad
   "…if the President says…" fixture (add, confirm caught, remove).
4. `/api/graph` JSON-LD includes `resolutionSource` and (when present)
   `resolvedOutcome`.

## Gated roadmap (depends on the MCP write path — do NOT build before it)

The enforcement half. Only matters once agents can **write**, which needs the
planned MCP server. Detail + sources in the two research docs.

- **Admission gate / identity** — human-gated *operator* admission (tiered
  proof-of-personhood); per-agent-codebase durable identity (the ERC-8004
  *pattern*, off-chain: a handle = hash of model + system-prompt + tool-stack) on an
  upgraded `AgentAttribution`; zero-trust-by-default (never trust an unsigned agent
  write). Write the `AgentAttribution` upgrade as its own plan, per the README.
- **Scoring / calibration** — Brier/log proper scoring per agent once forecasts
  resolve (F1 resolves 2028); reuse `src/lib/forecast.ts` aggregation; surface
  calibration + divergence-from-aggregate.
- **Laundering detection** — CIDRE-style network null-model + Gini/Zipf concentration
  over the claim/edge graph, calibrated against an external label; rationale-based
  (not count-based) collusion classification; LLM-as-judge as a *flagging layer only*.

## The unsolved core (leave unresolved by design)

Forecasts resolve against reality; **problem-trees and debate cruxes do not.** They
have no external anchor, so no gaming defense fully bites there — which is the Q2
adjudication problem. The honest design choice (`open-questions.md` Q2): make
**"unresolved — competing dossiers"** a first-class, legitimate terminal state
rather than forcing convergence. The `Dossier` type already supports permanent
dual-rendering (pro / con / cruxes); the integrity story for the debate module is
*transparency + provenance*, not resolution. Do not paper over this.

## Out of scope

- Identity fields on `AgentAttribution` (→ separate MCP-write-path plan).
- Any auth / write gating (no write path exists yet).
- Real proof-of-personhood provider integration; on-chain anything.
- Brier scoring implementation (no resolved forecasts until 2028).
