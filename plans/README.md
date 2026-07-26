# plans/

Project-level plans for follow-up work. Each file is a self-contained brief a
future session can execute without re-deriving context. Sorted roughly by the
order they could be picked up; pick any.

## Roadmap (current)

- [proposed-direction-2026-07.md](proposed-direction-2026-07.md) — the active
  sequencing out of the 2026-07-22 reflection (`research/reflection-2026-07.md`).
  Three PR-sized slices in order: **(1) discovery surface** (robots allow-stance,
  sitemap, llms.txt, markdown twins, agents surface) → **(2) remote MCP endpoint**
  (stateless `/mcp` in the Worker + server card) → **(3) corpus + resolution
  rigor** (3a integrity-foundations schema/lint, 3b ensemble run + short-horizon
  slate + 2 dossiers). It orders and reconciles the per-workstream plans below
  (`agent-surface`, `mcp-write-path`, `integrity-foundations`, `corpus-growth`)
  against the verified state of the code, which several of them predate.

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
| [domain-on-create.md](domain-on-create.md) | ~1–2 hr | Light — slot-on-create vs leave-free | None |
| [cross-domain-claim-drag.md](cross-domain-claim-drag.md) | ~half-day | Yes — extent strategy, confirm UX, coordinate math | None |
| [editor-mode-posture.md](editor-mode-posture.md) | ~3 hr (Posture 2) / ~12+ hr (Posture 3) | Yes — three postures to choose between | None |
| [open-weights-forecaster.md](open-weights-forecaster.md) | ~4–6 hr for the M2/F2 prototype | Yes — inference provider, model roster, aggregation rule | None |
| [organic-traffic-dual-ux.md](organic-traffic-dual-ux.md) | ~3–4 days across phases | Light — content negotiation vs parallel URLs, crawler stance | Audit batches 1–2 (`code-quality-audit.md`), agent-surface refresh |
| [graph-state-integrity.md](graph-state-integrity.md) | ~half-day (mostly QA) | Light — inline persistence, seed-hash scope, notify vs nuke | None (audit batch 1 merged) |

Suggested order (2026-07-11 review): FLF entry first (hard deadline; carries
the deploy + LICENSE), then integrity-foundations → repo-hardening →
agent-surface → corpus-growth, with funding applications
running in parallel as evidence items land. The pre-review plans
(domain-on-create, cross-domain-claim-drag, editor-mode-posture,
open-weights-forecaster) remain independent and can interleave.

Note: `open-weights-forecaster.md`'s aggregation substrate already landed in
session 7 — `src/lib/forecast.ts` (`median`/`spread`/`aggregate`/`leaveOneOut`/
`simulatedN`). The remaining scope is live multi-model inference + display, not
the math.

## Shipped

- [mcp-write-path.md](mcp-write-path.md) — done. The four `propose_*` tools
  went live in sessions 18–20 (`POST /api/proposals` in the Worker, canonical
  Zod validation, server-stamped provenance, native rate limiting, PR-only). The
  remote MCP endpoint that fronts them landed in session 30: a stateless
  `POST /mcp` serving both the `2026-07-28` and `2025-11-25` protocol
  revisions, plus a server card at `/.well-known/mcp.json`. The plan's
  Next.js-API-route design was never buildable under static export and was
  retracted in the file itself; `AgentAttribution`'s schema upgrade and OAuth
  remain open.

- [content-as-data.md](content-as-data.md) — done, session 29. Editorial prose
  moved to a loaded, validated `content/` tree: `site.md`, `home.md` and
  `about.md` read by `src/lib/content/`, rendered with `marked`. `/about`
  gained the Markdown twin session 28 left out, and `about/page.tsx` went from
  479 lines with 102 inline styles to 137 lines of chrome. The plan's slice A
  (a constants module) was built and superseded within the session. Deriving
  the spread table from `data/` came with it and corrected three published
  numbers that had gone stale against the claim pages.
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
