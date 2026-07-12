# plans/

Project-level plans for follow-up work. Each file is a self-contained brief a
future session can execute without re-deriving context. Sorted roughly by the
order they could be picked up; pick any.

## Open — deadline-driven (from the 2026-07-11 review)

| Plan | Deadline | Effort | Prereq |
| --- | --- | --- | --- |
| [flf-epistack-entry.md](flf-epistack-entry.md) | **2026-07-19** (submission) | ~2 sessions (writeup-led; T2/T3 optional) | Deploy (blocker); LICENSE done `7b3348e` |
| [funding-applications.md](funding-applications.md) | Rolling (micro-grants now) | ~1 day writing + evidence package | Evidence items: FLF entry, repo-hardening, one resolved forecast |

## Open — build

| Plan | Effort | Decision-heavy? | Prereq |
| --- | --- | --- | --- |
| [integrity-foundations.md](integrity-foundations.md) | ~2–3 hr (do-now slice) | Light–medium — resolutionSource shape, lint severity, resolvedOutcome type | None (enforcement half gated on MCP write path) |
| [repo-hardening.md](repo-hardening.md) | ~3–4 hr | Light — license choice | §4 blocked on domain choice; rest none |
| [agent-surface.md](agent-surface.md) | ~3–5 hr | Light — /agents vs /about section | Canonical domain (deploy) |
| [corpus-growth.md](corpus-growth.md) | ~1–2 days | Medium — dossier targets, forecast slate | integrity-foundations (for §3) |
| [mcp-write-path.md](mcp-write-path.md) | ~2–3 days v1 slice, ~1–2 wk full | Yes — proposals route shape, auth, rate limits | repo-hardening (CI) |
| [domain-on-create.md](domain-on-create.md) | ~1–2 hr | Light — slot-on-create vs leave-free | None |
| [cross-domain-claim-drag.md](cross-domain-claim-drag.md) | ~half-day | Yes — extent strategy, confirm UX, coordinate math | None |
| [editor-mode-posture.md](editor-mode-posture.md) | ~3 hr (Posture 2) / ~12+ hr (Posture 3) | Yes — three postures to choose between | None |
| [open-weights-forecaster.md](open-weights-forecaster.md) | ~4–6 hr for the M2/F2 prototype | Yes — inference provider, model roster, aggregation rule | None |

Suggested order (2026-07-11 review): FLF entry first (hard deadline; carries
the deploy + LICENSE), then integrity-foundations → repo-hardening →
agent-surface → corpus-growth → mcp-write-path, with funding applications
running in parallel as evidence items land. The pre-review plans
(domain-on-create, cross-domain-claim-drag, editor-mode-posture,
open-weights-forecaster) remain independent and can interleave.

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
