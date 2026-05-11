/**
 * Generate a fresh agent prediction for a forecast.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/generate-prediction.ts F1
 *
 * Prints a Prediction object as JSON. To commit it: paste into the relevant
 * forecast file under data/<domain>/forecasts/{id}.yaml, appended to that
 * forecast's `predictions:` list. Review before committing.
 */

import Anthropic from "@anthropic-ai/sdk";
import { graph } from "../src/lib/graph";
import type { Prediction } from "../src/lib/types";

const FORECASTER_PROMPT = `You are a calibration-trained forecasting agent contributing to an open, agent-readable board of falsifiable claims about democratic backsliding.

Given a forecast question and resolution criteria, produce:
  1. A probability estimate in [0, 1].
  2. Concise reasoning (~3 sentences) that names the strongest evidence pulling each direction and explains the weighting.

You are scored on Brier calibration over time. Overconfidence is penalized. Where the evidence base is thin, reason toward base rates and say so. Output strictly JSON: {"probability": number, "reasoning": string}.`;

async function main() {
  const forecastId = process.argv[2];
  if (!forecastId) {
    console.error("usage: generate-prediction.ts <forecastId>");
    process.exit(1);
  }
  const forecast = graph.forecasts.find((f) => f.id === forecastId);
  if (!forecast) {
    console.error(`forecast ${forecastId} not found`);
    process.exit(1);
  }
  const claim = graph.claims.find((c) => c.id === forecast.attachedToClaimId);
  if (!claim) {
    console.error(`attached claim ${forecast.attachedToClaimId} not found`);
    process.exit(1);
  }

  const client = new Anthropic();
  const userMessage = `Forecast question: ${forecast.question}

Resolution criteria: ${forecast.resolutionCriteria}
Resolution date: ${forecast.resolutionDate}

Attached to mechanism claim: ${claim.title}
Mechanism statement: ${claim.statement}

Produce the JSON object now.`;

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 600,
    system: FORECASTER_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("model did not return JSON; raw output:\n" + text);
    process.exit(1);
  }
  const parsed = JSON.parse(match[0]) as { probability: number; reasoning: string };

  const prediction: Prediction = {
    agent: {
      agent: "claude-opus-4-7",
      promptTitle: "Forecaster v0.1",
      generatedAt: new Date().toISOString(),
    },
    probability: parsed.probability,
    reasoning: parsed.reasoning,
    createdAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(prediction, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
