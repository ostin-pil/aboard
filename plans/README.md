# plans/

Project-level plans for follow-up work. Each file is a self-contained brief a
future session can execute without re-deriving context. Sorted roughly by the
order they could be picked up; pick any.

## Open

| Plan | Effort | Decision-heavy? | Prereq |
| --- | --- | --- | --- |
| [editor-mode-posture.md](editor-mode-posture.md) | ~3 hr (Posture 2) / ~12+ hr (Posture 3) | Yes — three postures to choose between | None |
| [open-weights-forecaster.md](open-weights-forecaster.md) | ~4–6 hr for the M2/F2 prototype | Yes — inference provider, model roster, aggregation rule | None |

These are independent — no dependencies between them. They can be tackled in
any order, in parallel forks, or interleaved.

Note: `open-weights-forecaster.md`'s aggregation substrate already landed in
session 7 — `src/lib/forecast.ts` (`median`/`spread`/`aggregate`/`leaveOneOut`/
`simulatedN`). The remaining scope is live multi-model inference + display, not
the math.

## Shipped

- [second-domain-cross-domain.md](second-domain-cross-domain.md) — done. The
  `inequality` domain (8 claims: IL/IM/IS) and three cross-domain edges
  (CE1–CE3, each with sourced rationale) are live in `data/`. Cross-domain is
  no longer hypothetical; the plan's "UI option B vs A" question was the only
  light part and the data layer is authoritative.

The fourth open thread — a **richer Agent identity model for ensemble
forecasting** — is referenced inside `open-weights-forecaster.md` as
deliberately out of scope for the prototype. Once that prototype runs and
we understand the access patterns, write a separate plan to upgrade
`AgentAttribution`.
