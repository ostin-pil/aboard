# Handover — aboard (point-in-time, 2026-06-12)

A "start here" brief for whoever picks aboard up next (a future session or a
collaborator). Point-in-time — for live orientation, also run
`/lifecycle-kit:session-start` and check `git log`.

## TL;DR

A research arc (sessions 12–13) is complete and merged to `main`: it validated
aboard's methodology-first thesis, mapped the integrity / anti-gaming design, and
translated it into a buildable plan. The next concrete step is the **do-now slice
of `plans/integrity-foundations.md`** — the first code change the arc implies
(small, ~2–3 hr, type-safe, no dependency on the not-yet-built write path).

## What landed (all merged to `main`)

| PR | Contents |
| --- | --- |
| #14 | `feat(graph)` assign-domain-on-create (session 12) + `research/agent-first-validation.md` |
| #15 | `research/integrity-anti-gaming.md`, `research/sybil-identity.md`, session-13 log |
| #16 | `plans/integrity-foundations.md` |

## The one idea to carry forward

**Integrity, adjudication, and Sybil-resistance are the same problem: every
gaming-resistant defense terminates in an external, real-world anchor outside the
agent graph.** (Sources: the three research docs.) Forecasts have an anchor —
real-world resolution; **problem-trees and debate cruxes do not**, so
"unresolved — competing dossiers" is a *legitimate terminal state* (open-questions
Q2), not a failure to paper over. This is aboard's clearest design constraint and
its sharpest tension with the agent-first, high-throughput vision.

## Next action (ready to build now)

The do-now slice of `plans/integrity-foundations.md`:

1. `Forecast` gets `resolutionSource` (+ `resolvedOutcome`/`resolvedAt`); backfill
   F1–F5. Ripple to `public/schema/v0.json` + `src/lib/jsonld.ts` +
   `research/schema.md` in the **same commit** (CLAUDE.md rule).
2. Resolution-criteria lint (`scripts/lint-resolution.ts`) that flags "X says Y"
   triggers + ill-defined criteria; warn-first.
3. Make `Edge.rationale` required — confirmed safe (all 19 edges already carry it).

Gate: `npx tsc --noEmit` + `npm run build` + `clients/validate.ts` against the
updated `v0.json`.

## Also open

- Independent plans: `open-weights-forecaster.md` (~4–6 hr), `editor-mode-posture.md`,
  `cross-domain-claim-drag.md`.
- **Gated on the MCP write path** (don't build before it exists): per-codebase
  identity + operator admission (ERC-8004 pattern), Brier scoring / calibration,
  CIDRE laundering detection. See the `integrity-foundations.md` roadmap + the two
  research docs. The `AgentAttribution` upgrade gets its own plan when the write
  path's access pattern is known.

## Still-thin research

PGP web-of-trust scaling specifics; verifiable agent lineage/forking attestation
beyond ERC-8004; per-system *documented-attack* track records for the named PoP
systems (only summary-level so far).

## Operational notes

- **Branch hygiene:** `feature/session-12-domain-on-create`, `docs/research-integrity`,
  `docs/integrity-foundations-plan` are merged — prunable via `/prune-branches`.
- **Pushing is gated** in this environment — run `! git push …` manually; `gh pr merge` works.
- The `deep-research` workflow's verify stage is rate-limit-fragile; use the failsafe
  **1-web + 2-reason** hybrid (saved in memory: `reference_deep_research_verify`).
  Running 3+ large workflows in a day depletes a shared rate-limit budget.

## Read-first order

1. `research/integrity-anti-gaming.md` + `research/sybil-identity.md` — the findings.
2. `plans/integrity-foundations.md` — the plan.
3. `sessions/2026-06-12_session_13.md` — the arc + the workflow-engineering story.
