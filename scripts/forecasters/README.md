# scripts/forecasters/

Ensemble forecaster for aboard. Replaces the single-Claude
`scripts/generate-prediction.ts` script with an N-provider orchestrator that
runs the same prompt against multiple open-weights models (and optionally
Claude) in parallel, then emits N predictions for a forecast.

The point: forecasts get more honest when N models disagree, and the system
is calibrated against ensemble medians rather than any single agent's
opinion. Disagreement is the signal — see `src/lib/forecast.ts` for the
aggregator that surfaces spread alongside the median.

## Setup

```bash
# Copy the example and fill in only the providers you have keys for.
cp scripts/forecasters/providers.example.json scripts/forecasters/providers.local.json
$EDITOR scripts/forecasters/providers.local.json
```

The `providers.local.json` file is gitignored. Each entry is a
`ProviderConfig` — see `providers/types.ts` for the full shape:

```jsonc
{
  "name": "openrouter-llama",            // CLI-selectable label
  "kind": "openai-compatible",           // | "ollama-native" | "anthropic-native"
  "baseURL": "https://openrouter.ai/api/v1",
  "apiKeyEnv": "OPENROUTER_API_KEY",     // env var holding the key
  "model": "meta-llama/llama-3.3-70b-instruct",
  "maxTokens": 800,                      // optional, default 800
  "temperature": 0.4                     // optional, default 0.4
}
```

Then export the relevant API keys:

```bash
export OPENROUTER_API_KEY=sk-or-…
export GROQ_API_KEY=gsk_…
export ANTHROPIC_API_KEY=sk-ant-…
# Local Ollama / vLLM / llama.cpp: no key needed.
```

## Providers

Three adapter kinds ship:

- **`openai-compatible`** — most providers. Works with OpenRouter, Groq,
  Together, DeepInfra, vLLM (`--api-server`), LM Studio, llama.cpp's `/v1`
  server, and Ollama with the `/v1` shim. Just point `baseURL` at the
  service.
- **`ollama-native`** — local Ollama via `/api/generate` for users who
  haven't enabled the OpenAI compatibility shim. Concatenates system+user
  prompts since Ollama's generate endpoint doesn't take a message array.
- **`anthropic-native`** — wraps `@anthropic-ai/sdk`. Preserves the
  regeneration path for the existing Claude-authored seed predictions.

## Usage

```bash
# Print N predictions to stdout (ready to paste into a forecast YAML)
npx tsx scripts/forecasters/ensemble-predict.ts --forecast F2

# Subset of providers from the config (others ignored)
npx tsx scripts/forecasters/ensemble-predict.ts \
  --forecast F2 \
  --providers openrouter-llama,openrouter-qwen,local-ollama

# Append predictions directly into the forecast file
npx tsx scripts/forecasters/ensemble-predict.ts --forecast F2 --update
```

Predictions are appended, not overwritten. Re-running for the same forecast
adds more predictions — the audit trail stays intact.

## Prompt

The shared system prompt lives in `prompt.ts` (`FORECASTER_PROMPT`). The
same prompt goes to every provider — disagreement under identical input is
exactly what the ensemble is supposed to surface. Tuning per-model prompts
sacrifices that signal for marginal quality.

## Cost

Per-call cost on open-weights providers is typically $0.0005–$0.005. Four
models per forecast lands at $0.002–$0.02 per ensemble run. Anthropic
`claude-opus-4-7` is materially more expensive (~$0.05–$0.10 per run); use
it sparingly and only when its calibration is needed.

## Adding a new adapter

1. Implement `Provider` in `providers/<name>.ts`.
2. Extend `ProviderKind` in `providers/types.ts`.
3. Register the factory in `ensemble-predict.ts:makeProvider()`.

## Out of scope (separate plans)

- **Brier-weighted aggregation.** Needs resolved forecasts; nothing to
  weight against yet. See `src/lib/forecast.ts` for the current median-based
  aggregator.
- **Continuous re-prediction on a schedule.** Run this script via cron or a
  CI job; nothing in the script itself prevents it.
- **Structured base rates and data anchors per prediction** — see
  `plans/we-have-several-plans-flickering-shore.md` Phase E. The current
  prediction shape is intentionally thin.
