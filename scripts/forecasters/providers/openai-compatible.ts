import OpenAI from "openai";
import type { Provider, ProviderConfig } from "./types";

/**
 * OpenAI-compatible Chat Completions adapter.
 *
 * Works with any provider that implements the OpenAI Chat Completions API:
 * OpenRouter, Groq, Together, DeepInfra, vLLM, LM Studio, llama.cpp `--api`
 * server, or Ollama with `OLLAMA_ORIGINS=*` and the `/v1` path. The user
 * supplies `baseURL`, an env var holding the API key (omit for local
 * unauthenticated endpoints), and the model identifier as the provider
 * expects it.
 *
 * Retries with exponential backoff on transient errors. Rate-limit (429) and
 * server (5xx) errors retry up to three times; other errors propagate.
 */
export function openAICompat(config: ProviderConfig): Provider {
  if (config.kind !== "openai-compatible") {
    throw new Error(`openAICompat: expected kind=openai-compatible, got ${config.kind}`);
  }
  const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;
  if (config.apiKeyEnv && !apiKey) {
    throw new Error(
      `openAICompat[${config.name}]: env var ${config.apiKeyEnv} is not set. ` +
        `Either export it or remove apiKeyEnv from the provider config for local endpoints.`
    );
  }
  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: apiKey ?? "sk-local-no-auth", // OpenAI SDK requires a non-empty string
  });

  const name = `${config.name}/${config.model}`;
  const maxTokens = config.maxTokens ?? 1600;
  const temperature = config.temperature ?? 0.4;

  return {
    name,
    async complete({ system, user }) {
      const maxAttempts = 3;
      let lastErr: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const res = await client.chat.completions.create({
            model: config.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: maxTokens,
            temperature,
          });
          const text = res.choices[0]?.message?.content;
          if (!text || text.trim().length === 0) {
            throw new Error(`openAICompat[${name}]: empty completion`);
          }
          return text;
        } catch (err) {
          lastErr = err;
          const status =
            typeof err === "object" && err !== null && "status" in err
              ? (err as { status?: number }).status
              : undefined;
          const transient = status === 429 || (status !== undefined && status >= 500);
          if (!transient || attempt === maxAttempts - 1) break;
          const delayMs = 500 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`openAICompat[${name}]: ${String(lastErr)}`);
    },
  };
}
