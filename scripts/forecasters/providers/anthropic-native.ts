import Anthropic from "@anthropic-ai/sdk";
import type { Provider, ProviderConfig } from "./types";

/**
 * Anthropic native adapter.
 *
 * Preserves the regeneration path for the existing Claude-authored seed
 * predictions (F1, F3, F4, F5) after the `scripts/generate-prediction.ts`
 * script is retired. The Anthropic SDK reads `ANTHROPIC_API_KEY` from the
 * environment by default; we explicitly thread the apiKey from the
 * configured env var for clarity.
 *
 * The `baseURL` field is honored, so this adapter can also target any
 * Anthropic-compatible proxy (e.g. Bedrock via LiteLLM in Anthropic mode).
 */
export function anthropicNative(config: ProviderConfig): Provider {
  if (config.kind !== "anthropic-native") {
    throw new Error(`anthropicNative: expected kind=anthropic-native, got ${config.kind}`);
  }
  const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      `anthropicNative[${config.name}]: no API key. Set ${
        config.apiKeyEnv ?? "ANTHROPIC_API_KEY"
      } in the environment.`
    );
  }
  const client = new Anthropic({ apiKey, baseURL: config.baseURL });
  const name = `${config.name}/${config.model}`;
  const maxTokens = config.maxTokens ?? 800;
  const temperature = config.temperature ?? 0.4;

  return {
    name,
    async complete({ system, user }) {
      const res = await client.messages.create({
        model: config.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = res.content.find((c) => c.type === "text");
      if (!block || block.type !== "text") {
        throw new Error(`anthropicNative[${name}]: response contained no text block`);
      }
      return block.text;
    },
  };
}
