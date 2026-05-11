# plans/

Project-level plans for follow-up work. Each file is a self-contained brief a
future session can execute without re-deriving context. Sorted roughly by the
order they could be picked up; pick any.

| Plan | Effort | Decision-heavy? | Prereq |
| --- | --- | --- | --- |
| [editor-mode-posture.md](editor-mode-posture.md) | ~3 hr (Posture 2) / ~12+ hr (Posture 3) | Yes — three postures to choose between | None |
| [open-weights-forecaster.md](open-weights-forecaster.md) | ~4–6 hr for the M2/F2 prototype | Yes — inference provider, model roster, aggregation rule | None |
| [second-domain-cross-domain.md](second-domain-cross-domain.md) | ~4–6 hr | Light — mostly UI option B vs A | None |

These are independent — no dependencies between them. They can be tackled in
any order, in parallel forks, or interleaved.

The fourth open thread — a **richer Agent identity model for ensemble
forecasting** — is referenced inside `open-weights-forecaster.md` as
deliberately out of scope for the prototype. Once that prototype runs and
we understand the access patterns, write a separate plan to upgrade
`AgentAttribution`.
