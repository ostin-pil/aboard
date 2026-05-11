#!/usr/bin/env -S npx tsx
/**
 * Ensemble forecaster orchestrator.
 *
 * Loads a forecast file by ID, runs N configured providers in parallel
 * against the same prompt, and emits N predictions as YAML — either to
 * stdout (default) or appended directly into the forecast file (--update).
 *
 *   npx tsx scripts/forecasters/ensemble-predict.ts \\
 *     --forecast F2 \\
 *     --providers openrouter-llama,openrouter-qwen,openrouter-deepseek,local-ollama \\
 *     --update
 *
 * Provider configurations live in `scripts/forecasters/providers.local.json`
 * (gitignored). See `providers.example.json` for the shape. The `--providers`
 * flag selects a subset by `name`; omit to run all configured providers.
 *
 * Cost: ~$0.001–$0.01 per forecast at typical open-weights pricing for 3-4
 * models. The orchestrator does NOT estimate cost upfront; check your
 * provider dashboard if running large batches.
 *
 * The orchestrator is intentionally append-only — it never overwrites
 * existing predictions. Re-running for the same forecast adds more
 * predictions rather than replacing them, so an audit trail is preserved.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";
import matter from "gray-matter";

import type { Provider, ProviderConfig } from "./providers/types";
import { openAICompat } from "./providers/openai-compatible";
import { ollamaNative } from "./providers/ollama-native";
import { anthropicNative } from "./providers/anthropic-native";
import { FORECASTER_PROMPT, userPromptFor, parseRawPrediction } from "./prompt";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Args = {
  forecastId: string;
  providersFilter?: string[];
  configPath: string;
  update: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    forecastId: "",
    configPath: join(__dirname, "providers.local.json"),
    update: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--forecast") args.forecastId = argv[++i];
    else if (a === "--providers") args.providersFilter = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--config") args.configPath = argv[++i];
    else if (a === "--update") args.update = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(1);
    }
  }
  if (!args.forecastId) {
    console.error("missing required --forecast <id>. Run with --help for usage.");
    process.exit(1);
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(`ensemble-predict.ts — run N providers against a forecast

Usage:
  npx tsx scripts/forecasters/ensemble-predict.ts --forecast <id> [options]

Options:
  --forecast <id>          Forecast ID to run (e.g. F2, IF1). Required.
  --providers a,b,c        Subset of provider names from the config to run.
                           If omitted, runs every provider in the config.
  --config <path>          Path to providers JSON. Default:
                           scripts/forecasters/providers.local.json
  --update                 Append predictions to the forecast's YAML file.
                           Without this flag, predictions are printed to
                           stdout as a ready-to-paste YAML block.
  -h, --help               Print this help.

Environment:
  Each provider config can reference an env var via 'apiKeyEnv'. Common
  patterns: OPENROUTER_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY. Local
  unauthenticated endpoints (e.g. Ollama on localhost) omit apiKeyEnv.
`);
}

function loadProviderConfigs(path: string): ProviderConfig[] {
  if (!existsSync(path)) {
    throw new Error(`providers config not found at ${path}. See providers.example.json for the shape.`);
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`providers config must be a JSON array of ProviderConfig`);
  }
  return parsed as ProviderConfig[];
}

function makeProvider(cfg: ProviderConfig): Provider {
  switch (cfg.kind) {
    case "openai-compatible":
      return openAICompat(cfg);
    case "ollama-native":
      return ollamaNative(cfg);
    case "anthropic-native":
      return anthropicNative(cfg);
    default: {
      const _exhaustive: never = cfg.kind;
      throw new Error(`unknown provider kind: ${String(_exhaustive)}`);
    }
  }
}

type RawForecast = {
  id: string;
  attachedToClaimId: string;
  question: string;
  resolutionDate: string;
  resolutionCriteria: string;
  predictions: unknown[];
};

type RawClaim = {
  id: string;
  kind: string;
  title: string;
  domain: string;
};

function dataRoot(): string {
  return join(process.cwd(), "data");
}

function findForecastFile(forecastId: string): { path: string; domain: string } {
  const root = dataRoot();
  for (const domain of readdirSync(root)) {
    const dir = join(root, domain, "forecasts");
    if (!existsSync(dir)) continue;
    for (const fname of readdirSync(dir)) {
      if (!fname.endsWith(".yaml") && !fname.endsWith(".yml")) continue;
      const candidate = join(dir, fname);
      const parsed = YAML.parse(readFileSync(candidate, "utf8")) as { id?: string };
      if (parsed.id === forecastId) return { path: candidate, domain };
    }
  }
  throw new Error(`forecast ${forecastId} not found under data/<domain>/forecasts/`);
}

function loadAttachedClaim(domain: string, claimId: string): RawClaim & { statement: string } {
  const path = join(dataRoot(), domain, "claims", `${claimId}.md`);
  if (!existsSync(path)) {
    throw new Error(`attached claim ${claimId} not found at ${path}`);
  }
  const { data, content } = matter(readFileSync(path, "utf8"));
  return {
    id: data.id,
    kind: data.kind,
    title: data.title,
    domain: data.domain,
    statement: content.trim(),
  };
}

type EnsembleResult = {
  agent: { agent: string; promptTitle: string; generatedAt: string };
  probability: number;
  reasoning: string;
  baseRates?: Array<{
    question: string;
    rate: number;
    source: { label: string; url: string; kind?: string; finding?: string };
  }>;
  dataAnchors?: Array<{ label: string; url: string; kind?: string; finding?: string }>;
  createdAt: string;
};

async function runProvider(
  provider: Provider,
  forecast: RawForecast,
  claim: RawClaim & { statement: string }
): Promise<EnsembleResult> {
  const system = FORECASTER_PROMPT;
  const user = userPromptFor({
    forecastId: forecast.id,
    attachedClaim: {
      id: claim.id,
      title: claim.title,
      statement: claim.statement,
      kind: claim.kind,
      domain: claim.domain,
    },
    question: forecast.question,
    resolutionDate: forecast.resolutionDate,
    resolutionCriteria: forecast.resolutionCriteria,
  });
  const text = await provider.complete({ system, user });
  const parsed = parseRawPrediction(text);
  const now = new Date().toISOString();
  const result: EnsembleResult = {
    agent: {
      agent: provider.name,
      promptTitle: "ensemble-forecaster-v0.1",
      generatedAt: now,
    },
    probability: parsed.probability,
    reasoning: parsed.reasoning,
    createdAt: now,
  };
  if (parsed.baseRates.length > 0) result.baseRates = parsed.baseRates;
  if (parsed.dataAnchors.length > 0) result.dataAnchors = parsed.dataAnchors;
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const allConfigs = loadProviderConfigs(args.configPath);
  const filtered = args.providersFilter
    ? allConfigs.filter((c) => args.providersFilter!.includes(c.name))
    : allConfigs;
  if (filtered.length === 0) {
    console.error("no providers selected; check --providers against your config");
    process.exit(1);
  }

  const { path: forecastPath, domain } = findForecastFile(args.forecastId);
  const forecastRaw = YAML.parse(readFileSync(forecastPath, "utf8")) as RawForecast;
  const claim = loadAttachedClaim(domain, forecastRaw.attachedToClaimId);

  console.error(`Running ${filtered.length} provider(s) for ${args.forecastId} (claim ${claim.id}, ${domain})…`);
  const results = await Promise.allSettled(
    filtered.map(async (cfg) => {
      const provider = makeProvider(cfg);
      console.error(`  → ${provider.name}`);
      const t0 = Date.now();
      const out = await runProvider(provider, forecastRaw, claim);
      console.error(`    ✓ ${provider.name}: P=${out.probability.toFixed(2)} (${Date.now() - t0}ms)`);
      return out;
    })
  );

  const successes: EnsembleResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") successes.push(r.value);
    else console.error(`    ✗ ${filtered[i].name}: ${(r.reason as Error).message ?? String(r.reason)}`);
  }
  if (successes.length === 0) {
    console.error("all providers failed; no predictions produced");
    process.exit(1);
  }

  const yamlBlock = YAML.stringify(successes);

  if (args.update) {
    forecastRaw.predictions = [...(forecastRaw.predictions ?? []), ...successes];
    writeFileSync(forecastPath, YAML.stringify(forecastRaw));
    console.error(
      `Appended ${successes.length} prediction(s) to ${forecastPath}. Forecast now has ${forecastRaw.predictions.length} total.`
    );
  } else {
    process.stdout.write(yamlBlock);
  }
}

main().catch((err) => {
  console.error(`fatal: ${(err as Error).message ?? String(err)}`);
  process.exit(1);
});
