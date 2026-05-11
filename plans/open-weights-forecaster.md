# Plan: open-weights forecaster prototype

Replace the single-Claude forecast with an ensemble of cheap open-weights
models against one mechanism, end-to-end. Proves the cost-aware forecasting
story (vision decision #4) with real artifacts.

## Context

Today's forecasts are baked outputs from Claude. The vision decision
(2026-05-10) is **open-weights + ensemble**: multiple cheap models, aggregated
via Brier-weighted vote or similar. This plan builds the minimal real version.

`scripts/generate-prediction.ts` already exists and talks to Anthropic; it
emits one prediction at a time and asks the user to paste into the relevant
forecast YAML.

## Goal

For exactly one mechanism (recommend **M2 — Affective polarization erodes
democratic norms**, since its forecast F2 is the most defensible: ANES data is
public, the question is well-defined, and the resolution date is 2028 so the
prediction has real life ahead of it), produce predictions from 3–4 different
open-weights models, store them, compute an aggregate, and display both the
aggregate and individual predictions on the claim detail page.

## Decisions to make before coding

### 1. Inference provider

- **OpenRouter.** Single API, ~30 open-weights models, pay-per-token,
  ~$0.10–$0.50 per 1M tokens for the cheapest. Standard OpenAI-compatible API.
  Best for "ship in one session."
- **Groq.** Free tier with rate limits; extremely fast inference. Limited
  model selection. Good for the demo but rate limits will bite if scaled.
- **Local Ollama / llama.cpp.** Zero per-call cost; requires the user to run a
  local server. Strongest for the "true open-weights, agent-first" narrative,
  weakest for "anyone can run this in CI."

**Recommendation:** OpenRouter for the prototype. Document a local-Ollama path
in `scripts/README.md` for users who prefer it.

### 2. Model selection (3–4 models, distinct families)

Sample roster to start (subject to availability and cost on the chosen
provider):

- `meta-llama/llama-3.3-70b-instruct`
- `qwen/qwen-2.5-72b-instruct`
- `deepseek/deepseek-chat`
- `mistralai/mistral-large` (semi-open; "open-weights-ish")

Each is a different lineage — Meta, Alibaba, DeepSeek, Mistral. Disagreement
across them is more informative than 3 variants of the same family.

### 3. Aggregation rule

For binary forecasts, aggregating probabilities:

- **Simple median.** Robust, simple, no calibration data needed.
- **Mean.** More sensitive to outliers; usually worse for calibration.
- **Brier-weighted.** Requires historical calibration data per agent — we
  don't have it. Use median for v1; switch to Brier-weighted once we have a
  track record of resolved forecasts.

**Recommendation:** Start with median. Show median prominently as the headline
probability; show individual predictions in a collapsible.

### 4. Aggregate type semantics

The data model already supports multiple predictions per forecast (the
`predictions` array). Two ways to handle the aggregate:

- **Computed on the fly** in the UI. Don't store the aggregate. Cleaner.
- **Stored alongside predictions** as a special entry with `agent: "aggregate"`.
  Auditable but adds a fake author.

**Recommendation:** Computed on the fly. Add a helper `aggregateProbability(predictions): number`.

## Concrete file-level work

### Scripts

- `scripts/forecasters/ensemble-predict.ts` (new) — like
  `generate-prediction.ts` but takes a forecast ID + a list of model IDs,
  produces N predictions in parallel via the OpenRouter API. Emits a YAML
  array ready to append to the forecast file. Reuses the same prompt
  template (system prompt about calibration, Brier scoring, base rates).
  Optional flag `--update` writes back to `data/<domain>/forecasts/<id>.yaml`
  directly after confirming.
- `scripts/forecasters/README.md` — documents OpenRouter setup, local-Ollama
  alternative, the prompt template, the model roster, how to interpret output.
- Update `scripts/generate-prediction.ts` to be aware of the ensemble script
  (point at it in a comment); deprecate over time.

### Data

- Run the script for **F2 only** in this prototype. Append 3–4 predictions to
  `data/democratic_backsliding/forecasts/F2.yaml`. Verify the loader still
  validates and the briefing still renders.

### Types and helpers

- `src/lib/forecast.ts` (new) — `aggregateProbability(predictions: Prediction[]): { median: number; mean: number; spread: number; count: number }`.
  The `spread` value is the range (max − min) and is a critical signal: a
  forecast where four models agree at 0.5 is very different from one where
  they range 0.15–0.85.

### UI

- `src/app/claims/[id]/page.tsx` — When a forecast has >1 prediction, render:
  - A headline: `aggregate P = 0.62` in large mono with the model count
    underneath (`4 agents, spread 0.25`).
  - A collapsible "Individual predictions" section listing each agent's
    probability + reasoning, with model family color coding (Llama / Qwen /
    DeepSeek / Mistral). Keep the visible-attribution rule honest.

### OG cards

- `src/app/claims/[id]/opengraph-image.tsx` — for claims with ensemble
  forecasts, surface the aggregate ("attached forecast · P=0.62 (ensemble)").

### Schema

- Update `research/schema.md` and `public/schema/v0.json` to clarify that
  `predictions` is an *ensemble*. No structural change required.

## Verification

1. `npx tsx scripts/forecasters/ensemble-predict.ts F2 --update` writes 3–4
   new predictions to F2's YAML.
2. `clients/validate.ts http://localhost:3000/api/graph` still passes (no
   schema change required).
3. `clients/briefing.ts` shows all N predictions for F2.
4. `/claims/M2` shows the new aggregate UI and the collapsible breakdown.
5. The OG image at `/claims/M2/opengraph-image` reflects the ensemble.
6. The spread metric is visible somewhere prominent — disagreement is
   informative.

## Risks and unknowns

- **Open-weights calibration is worse than Claude's.** Predictions may
  cluster around 0.5 (the "I don't know" answer for an untrained forecaster)
  or be wildly overconfident. The first run will reveal this; the prototype's
  job is to *measure* it, not paper over it.
- **OpenRouter latency and rate limits.** Parallel requests to 4 models may
  hit per-account limits. Add retries with backoff.
- **Cost.** With 4 models × ~1500 tokens per call, one forecast costs maybe
  $0.001–$0.01. Document the per-forecast budget in the script's help.
- **Prompt sensitivity.** Different model families respond differently to the
  same prompt. Either: (a) use one prompt and accept variance as signal, or
  (b) tune per-family prompts and lose model-agnosticism. Recommend (a) for
  the prototype.

## Out of scope

- **Brier-weighting** — requires resolved forecasts; defer until we have any.
- **Replacing baked predictions for all 5 forecasts** — prototype against M2's
  F2 only.
- **Continuous re-prediction** (rerun on a schedule) — separate session.
- **A richer `AgentAttribution` type** with model version, runtime,
  promptFingerprint — touched briefly in `vision.md`. The first prototype can
  use the current thin type with `agent: "llama-3.3-70b-instruct via openrouter"`
  encoded as a single string; upgrade to a structured Agent type when we
  understand the access pattern.
