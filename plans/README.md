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

- [audit-2026-08.md](audit-2026-08.md) — the 2026-08-13 audit round:
  findings in five families (S security, P performance, U untracked debt,
  M distribution, R records) plus nine session-sized chunk plans covering
  them and the carried E-items. Its Suggested order supersedes the
  2026-07-11 ordering below for near-term work: truth batch → security →
  instrumentation → bundle → distribution mechanics → launch post, with
  the exporter/edge-identity, worker-test and small-items chunks
  interleaving freely.

## Open — deadline-driven (from the 2026-07-11 review)

| Plan | Deadline | Effort | Prereq |
| --- | --- | --- | --- |
| [funding-applications.md](funding-applications.md) | Rolling (micro-grants now) | ~1 day writing + evidence package | Evidence items: FLF entry (submitted, see Shipped), repo-hardening, one resolved forecast |

## Open — build

| Plan | Effort | Decision-heavy? | Prereq |
| --- | --- | --- | --- |
| [audit-2026-08.md](audit-2026-08.md) | 9 chunks, ~½–1 day each | Light — chunk 6 picks a test harness; the rest is decided | Chunk 8 (launch post) wants chunks 1, 4 and ideally 7 first; others independent |
| [integrity-foundations.md](integrity-foundations.md) | do-now slice shipped (session 34); enforcement half unscoped | Decisions taken; see its Status | Enforcement half was gated on the MCP write path, which is now met |
| [repo-hardening.md](repo-hardening.md) | ~3–4 hr | Light — license choice | §4 blocked on domain choice; rest none |
| [agent-surface.md](agent-surface.md) | ~3–5 hr | Light — /agents vs /about section | Canonical domain (deploy) |
| [corpus-growth.md](corpus-growth.md) | ~1–2 days | Medium — dossier targets, forecast slate | none remaining; §3's integrity-foundations prereq shipped in session 34 |
| [domain-on-create.md](domain-on-create.md) | ~1–2 hr | Light — slot-on-create vs leave-free | None |
| [cross-domain-claim-drag.md](cross-domain-claim-drag.md) | ~half-day | Yes — extent strategy, confirm UX, coordinate math | None |
| [editor-mode-posture.md](editor-mode-posture.md) | ~3 hr (Posture 2) / ~12+ hr (Posture 3) | Yes — three postures to choose between | None |
| [open-weights-forecaster.md](open-weights-forecaster.md) | ~4–6 hr for the M2/F2 prototype | Yes — inference provider, model roster, aggregation rule | None |
| [organic-traffic-dual-ux.md](organic-traffic-dual-ux.md) | ~2 days (§4–§7; §1–§3 shipped or superseded, see its Status) | Light — leaderboard timing, feed granularity | First resolution for §5's leaderboard; rest none |
| [agent-distribution.md](agent-distribution.md) | ~2 days (operator + writing) | Light — dataset home, post timing | MCP OAuth for §5's post; organic-traffic §7 instrumentation helps; rest none |
| [proposal-dry-run.md](proposal-dry-run.md) | ~half-day | Light — flag shape on the envelope | None |
| [signals-substrate.md](signals-substrate.md) | ~1 day | Medium — D1 vs KV, retention, MCP exposure | MCP OAuth |
| [news-layer.md](news-layer.md) | ~1–2 days + sweep cadence | Medium — filter rule, sweep tuning | signals-substrate, integrity-foundations |
| [agent-social-layer.md](agent-social-layer.md) | ~1–2 days | Medium — endorsement subjects, page naming | signals-substrate |
| [graph-state-integrity.md](graph-state-integrity.md) | ~half-day (mostly QA) | Light — inline persistence, seed-hash scope, notify vs nuke | None (audit batch 1 merged) |

Suggested order (2026-07-11 review), with the FLF entry since submitted and its
deadline passed: integrity-foundations (do-now slice shipped in session 34) →
repo-hardening → agent-surface → corpus-growth, with funding applications
running in parallel as evidence items land. The pre-review plans
(domain-on-create, cross-domain-claim-drag, editor-mode-posture,
open-weights-forecaster) remain independent and can interleave.

Note: `open-weights-forecaster.md`'s aggregation substrate already landed in
session 7 — `src/lib/forecast.ts` (`median`/`spread`/`aggregate`/`leaveOneOut`/
`simulatedN`). The remaining scope is live multi-model inference + display, not
the math.

## Shipped

- [flf-epistack-entry.md](flf-epistack-entry.md) — submitted by the 2026-07-19
  deadline. The writeup-led entry (Fork C) went in: the external-anchor thesis
  and both-readings methodology as the substance, the deployed site as the
  demonstration. The repo carries no confirmation reference or exact submission
  date, and the competition outcome is not yet known, so this records only that
  it was submitted and the deadline was met. The plan file stays for the
  argument it makes, which `funding-applications.md` draws on as an evidence
  item. Recorded in session 53, three weeks after the fact, because nothing in
  the repo had said either way.
- [mcp-oauth.md](mcp-oauth.md) — done, session 31. OAuth 2.1 + PKCE for
  `/mcp`: per-call authorization decisions in `src/lib/mcp/auth.ts`, the
  authorization server co-hosted in the Worker (`worker/oauth.ts`, GitHub as
  identity provider, DCR and CIMD, registration rate-limited), RFC 9728
  metadata, and 401 challenges carrying `WWW-Authenticate`. Deployed and
  verified in production; static agent tokens keep working. Follow-ups live
  in the session 31 log, not the plan.
- [mcp-write-path.md](mcp-write-path.md) — done. The four `propose_*` tools
  went live in sessions 18–20 (`POST /api/proposals` in the Worker, canonical
  Zod validation, server-stamped provenance, native rate limiting, PR-only). The
  remote MCP endpoint that fronts them landed in session 30: a stateless
  `POST /mcp` serving both the `2026-07-28` and `2025-11-25` protocol
  revisions, plus a server card at `/.well-known/mcp.json`. The plan's
  Next.js-API-route design was never buildable under static export and was
  retracted in the file itself. `AgentAttribution`'s schema upgrade (step 7:
  `operator` + `agentId` across type, schema, JSON-LD and docs) landed in
  session 18 (`884c83b`), though the plan carried it as open until session 38;
  OAuth moved to its own brief in [mcp-oauth.md](mcp-oauth.md).

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
deliberately out of scope for the prototype. It is no longer blocked: the
write path, OAuth, and the first outside filing (`ECM2`, PR #66) supplied the
access pattern it was waiting on, and the identity *fields* (`operator`,
`agentId`) landed in session 18. What remains is the machinery around them —
operator admission, per-codebase handles, verification — per the gated
roadmap in [integrity-foundations.md](integrity-foundations.md); write that
as its own plan when the work is picked up.
