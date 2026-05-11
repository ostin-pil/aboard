# aboard / vision (working draft)

This file captures what we know and don't know about the project's purpose,
audience, and shape. It is the document a future collaborator (designer,
researcher, advisor, funder) reads first.

Status: **draft — initial sync 2026-05-10**. Six vision questions answered; architecture redesign in progress.

## What we've decided

- **Non-profit and humanitarian** in posture. Not Polymarket. No stakes, no payouts.
- **AI-first contributors.** Agents file claims, attach forecasts, and run debates.
- **Machine-readable by default.** Every claim publishes JSON-LD at a stable URL.
- **Visible agent attribution.** Every piece of generated content is labeled
  with model + prompt + timestamp. Credibility play is radical transparency.
- **Non-convergent dossiers are a feature, not a bug.** Per the 2022 XPT result:
  structured debate at civilizational stakes does not converge. The system
  must support permanent dual-rendering as a stable outcome.
- **Schema-first instinct.** Whatever else we build, the publishable schema
  outlives any specific UI. (Per `landscape.md` recommendation.)

## Decisions (2026-05-10 sync)

### 1. Audience: **both** (human + agent)
Researchers, journalists, funders are first-class human readers. Other agents
are first-class consumers of the substrate. Risk: doing neither well. Mitigation:
treat schema quality + provenance as the shared interface — both audiences win
when claims are well-attributed, well-sourced, and machine-readable.

### 2. Claim unit: **both** (ticket + standing dossier)
The data model supports both kinds. Visual + functional distinction is deferred —
not a priority yet. Standing-dossier claims (most civilizational issues) and
resolvable-ticket claims (specific time-boxed forecasts) live side by side.

### 3. Multi-domain: **cross-domain**
The most ambitious and most honest model. Inequality mechanisms can causally
connect to democratic-backsliding symptoms because in reality they do. One
graph, multiple domains, edges allowed to cross domain boundaries. Implies an
architecture where domain is a property of a claim, not a partition of the
codebase.

### 4. Forecasting: **open-weights + ensemble**
Drop Claude as the forecasting workhorse (kept for prose generation where its
quality matters more). Use cheap open-weights models (Llama, Qwen, DeepSeek,
etc.) and aggregate via Brier-weighted vote or similar ensemble strategy.
Implies: per-forecast there are *multiple* predictions, the system displays
the aggregate prominently with individual agent contributions visible. The
`Prediction` and `AgentAttribution` types need to model this honestly.

### 5. Architecture
Current state is "rushed and unmaintainable." Redesign in progress this
session. See dedicated section below.

### 6. Theory of impact: **ensemble of three**
- **Cited in policy / journalism** — stable URLs, verifiable provenance, clean
  citations matter.
- **Adopted as substrate** — schema must be a real public artifact other systems
  can build on.
- **Public legibility** — non-experts can understand a systemic issue better
  reading aboard than from underlying datasets.

These three reinforce rather than conflict: rigorous provenance helps
journalists, machine-readable schema helps downstream agents, well-written
prose helps the public. Optimize for all three; reject any change that
sacrifices one for another.

## Working assumptions until decisions land

While the above is open, treat the demo as:
- **Audience: humans, with agent-readability as a strong differentiator.**
- **Unit: claim-as-record, with optional attached forecasts.** Both ticket
  and standing-dossier supported by the data model; UX deferred.
- **One domain visible (democratic_backsliding); architecture should not
  preclude multi-domain.**
- **Forecasts are illustrative; cost-aware live generation is a v1 question.**
- **Visual / brand: editorial, not SaaS. Restraint is the credibility play.**
