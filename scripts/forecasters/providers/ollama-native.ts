import type { Provider, ProviderConfig } from "./types";

/**
 * Ollama native `/api/generate` adapter.
 *
 * Use when running a local Ollama installation without the OpenAI shim
 * (`OLLAMA_HOST=http://localhost:11434`). For Ollama users who prefer the
 * `/v1/chat/completions` endpoint, use `openai-compatible.ts` instead with
 * `baseURL=http://localhost:11434/v1`.
 *
 * Concatenates the system + user prompts into a single text input — Ollama's
 * generate API doesn't take a message array. The forecaster prompt is
 * structured enough that the loss of role separation is acceptable here.
 */
export function ollamaNative(config: ProviderConfig): Provider {
  if (config.kind !== "ollama-native") {
    throw new Error(`ollamaNative: expected kind=ollama-native, got ${config.kind}`);
  }
  const name = `${config.name}/${config.model}`;
  const maxTokens = config.maxTokens ?? 800;
  const temperature = config.temperature ?? 0.4;
  const url = `${config.baseURL.replace(/\/$/, "")}/api/generate`;

  return {
    name,
    async complete({ system, user }) {
      const body = {
        model: config.model,
        prompt: `${system}\n\n---\n\n${user}`,
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature,
        },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`ollamaNative[${name}]: HTTP ${res.status} from ${url} — ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as { response?: string };
      const out = json.response?.trim();
      if (!out) throw new Error(`ollamaNative[${name}]: empty response`);
      return out;
    },
  };
}
