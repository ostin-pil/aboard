# Plan: funding applications — micro-grants first, anchors after evidence

The 12-month funding path from the 2026-07 landscape review: stack 2–3 fast
micro-grants now under a fiscal sponsor, target the $50k–$750k tier
(Mozilla, SFF) as the second act, and approach Coefficient Giving's
forecasting program only with usage evidence. The category's evidence bar is
**consumption, not construction** (Epoch got to $10M/yr on citations; OWID got
institutional funding after UN/WHO usage; SFF/Open-Phil write-ups price "who
uses this").

**Correction to the review (verified 2026-07-11):** the NGI Zero Commons Fund
is closed — its final call ended 2026-06-01. It is removed from the path;
NLnet's remaining open calls (NGI TALER, Fediversity; deadline 2026-08-01) do
not fit aboard. Re-check nlnet.nl occasionally for successor funds.

## 0. Fiscal sponsorship (decide once, ~1 hr + onboarding)

Don't incorporate. Options: **Hack Club HCB** (7%, includes 501(c)(3) status,
donation processing, bookkeeping) vs **Open Collective / OSC** (~10%,
open-source native, public ledger). *Recommend HCB* on fees unless the public
OSC ledger is itself wanted as a transparency artifact (which does fit
aboard's radical-transparency posture — maintainer's call). QURI's
fiscal-sponsorship-via-Rethink-Priorities shows this is the normal shape in
the epistemics niche.

## 1. Apply now (parallel, ~1 day of writing total)

| Target | Size | Notes |
| --- | --- | --- |
| **Cosmos Institute grants** | $1k–$10k, historically ~3-week decisions | "AI tools that serve human autonomy and truth-seeking" is their literal mandate; 100+ prototypes funded. Confirm the current window at cosmos-institute.org/grants before writing (status not verifiable on 2026-07-11). |
| **Emergent Ventures** | $1k–$50k, 2–3 week response | Rewards zero-to-one solo builders; the F4 both-readings artifact + deployed demo is the pitch. |
| **Anthropic Economic Futures** | $10k–$50k + API credits, rolling | Scope is AI's *economic* impacts — fits only via the inequality domain (e.g. "structured, falsifiable claims about AI-era inequality mechanisms"). Apply with that framing or skip; don't shoehorn. |

One shared application core, per-funder tailoring. The core = the evidence
package (§3).

## 2. Second act (apply when §3 has at least two items checked)

- **Mozilla AI & Democracy awards** — $50k (two scale-ups +$250k); window
  opened early 2026 — verify it's still open before writing.
- **SFF 2026 S-process** (+ speculation grants) — 2025 epistemics grantees
  landed $80k–$750k; the matching-pledge mechanism rewards exactly the
  small-donor diversification aboard should build anyway.
- **Coefficient Giving forecasting program** — the $250k+ anchor tier;
  historically requires demonstrated usage. Last, not first.

Sequencing note: the category is a near-monoculture anchored on
Coefficient/SFF. Treat every non-anchor grant as diversification evidence for
the anchor application, and start the OWID-style small-donor long tail early
(a donate link once fiscal sponsorship exists costs nothing).

## 3. Evidence package (the real work — everything else is writing)

- [ ] Deployed public URL (FLF plan, Day 1).
- [ ] FLF competition entry submitted (win or not, it's a credibility +
      priority artifact — `flf-epistack-entry.md`).
- [ ] LICENSE + CI (`repo-hardening.md`) — funders check the repo.
- [ ] **One external consumer**: a named agent/framework/researcher consuming
      `/api/graph` or the MCP read tools, in writing. Candidate targets: an
      LLM-forecasting research group (they hand-curate exactly this data), an
      argument-mining academic (AIFdb lineage), a fact-checking-tech org
      (Full Fact AI / Duke Reporters' Lab).
- [ ] **One resolved forecast** with computed Brier (short-horizon slate,
      `corpus-growth.md` §3) — or, until one resolves, the published slate
      with pre-committed resolution sources.
- [ ] One citation/mention in journalism, a think-tank note, or an academic
      preprint.

## Verification

Applications submitted are tracked in this file (append a dated status line
per target). The plan is "done" when two micro-grant decisions have returned
and the second-act applications are queued with ≥2 evidence items checked.

## Out of scope

- Selling eval data to labs (real market, but resolved forecast questions are
  already free via ForecastBench; revisit as a commissioned-benchmark service
  à la Epoch once the corpus has adjudicated cruxes at scale).
- Incorporation, tokens, or anything with securities overhead (settled by
  `open-questions.md` Q7: reputation + non-cashable stakes only).
