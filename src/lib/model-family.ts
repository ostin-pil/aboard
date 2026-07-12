/**
 * Map an agent-attribution label (the free-form `agent.agent` string, e.g.
 * "groq-qwen-3-32b/qwen/qwen3-32b" or "claude-opus-4-7") to a model family.
 *
 * Used for visual grouping in the ensemble predictions UI: disagreement across
 * *families* (Meta vs Alibaba vs DeepSeek) is more informative than across
 * variants of one family, so the family is worth surfacing at a glance.
 *
 * Pure and dependency-free — the match is a lowercase substring scan, ordered
 * so the more specific token (`gpt-oss`) is checked before any broader one.
 */
export type ModelFamily =
  | "claude"
  | "llama"
  | "qwen"
  | "deepseek"
  | "mistral"
  | "gpt-oss"
  | "other";

const FAMILY_LABELS: Record<ModelFamily, string> = {
  claude: "Claude",
  llama: "Llama",
  qwen: "Qwen",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  "gpt-oss": "GPT-OSS",
  other: "Other",
};

export function modelFamily(agentLabel: string): ModelFamily {
  const s = agentLabel.toLowerCase();
  if (s.includes("gpt-oss")) return "gpt-oss";
  if (s.includes("claude")) return "claude";
  if (s.includes("llama")) return "llama";
  if (s.includes("qwen")) return "qwen";
  if (s.includes("deepseek")) return "deepseek";
  if (s.includes("mistral")) return "mistral";
  return "other";
}

export function modelFamilyLabel(family: ModelFamily): string {
  return FAMILY_LABELS[family];
}
