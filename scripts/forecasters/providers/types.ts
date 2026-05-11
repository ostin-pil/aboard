/**
 * Provider abstraction for the ensemble forecaster.
 *
 * A `Provider` is anything that can take a system+user prompt and return raw
 * text. The orchestrator instantiates one Provider per configured row in
 * `providers.local.json` and runs them in parallel for a given forecast.
 *
 * Shipping adapters:
 *   - `openai-compatible.ts` — OpenRouter, Groq, Together, DeepInfra, vLLM,
 *     LM Studio, llama.cpp /v1, Ollama /v1. Anything that speaks the OpenAI
 *     Chat Completions API.
 *   - `ollama-native.ts` — Ollama's `/api/generate` endpoint, for users who
 *     don't want to enable the OpenAI compatibility shim.
 *   - `anthropic-native.ts` — `@anthropic-ai/sdk`. Preserves the regeneration
 *     path for the existing Claude-authored seed predictions.
 *
 * Adding a new provider kind: implement the `Provider` interface, register a
 * factory in `ensemble-predict.ts` keyed by `ProviderConfig.kind`.
 */

export type ProviderKind = "openai-compatible" | "ollama-native" | "anthropic-native";

export interface ProviderConfig {
  /** Human label used to identify this entry in CLI flags (`--providers a,b,c`). */
  name: string;
  /** Adapter family. */
  kind: ProviderKind;
  /** Base URL for the API. `https://openrouter.ai/api/v1`, `http://localhost:11434`, etc. */
  baseURL: string;
  /** Environment variable holding the API key. Omit for local providers without auth. */
  apiKeyEnv?: string;
  /** Model identifier as the provider expects it. `meta-llama/llama-3.3-70b-instruct`, `llama3.3:70b`, `claude-opus-4-7`. */
  model: string;
  /** Sampling cap. Default 800. */
  maxTokens?: number;
  /** Sampling temperature. Default 0.4 — forecasts want stable probabilities. */
  temperature?: number;
}

export interface Provider {
  /**
   * Stable identifier of the form `<config-name>/<model>`. Embedded into the
   * resulting `AgentAttribution.agent` string so each prediction is traceable
   * to its source.
   */
  readonly name: string;
  /** Returns raw text from the model. The orchestrator parses it as JSON. */
  complete(input: { system: string; user: string }): Promise<string>;
}
