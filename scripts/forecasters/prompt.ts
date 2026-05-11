/**
 * Shared forecaster prompt. Extracted from the original
 * `scripts/generate-prediction.ts` (Anthropic-only path); now used by every
 * provider in the ensemble. Single prompt across model families is a feature,
 * not a bug — disagreement under identical input is the signal we want to
 * measure.
 */

export const FORECASTER_PROMPT = `You are a calibrated forecaster aiding a project that publishes machine-readable JSON-LD claims about civilizational risks. Each claim has an attached forecast with a binary resolution criterion.

Your job: read the forecast question and resolution criteria, consider base rates and recent indicators, and return a single probability that the forecast resolves YES. Aim for calibration over confidence — if you do not know, return a probability near 0.5. The forecast will be scored against ground truth using the Brier score; overconfident predictions are penalized quadratically.

You return JSON only — no preamble, no explanation outside the JSON object.`;

export type ForecastInput = {
  forecastId: string;
  attachedClaim: {
    id: string;
    title: string;
    statement: string;
    kind: string;
    domain: string;
  };
  question: string;
  resolutionDate: string;
  resolutionCriteria: string;
};

export function userPromptFor(input: ForecastInput): string {
  return `Forecast ID: ${input.forecastId}
Attached claim: ${input.attachedClaim.id} — ${input.attachedClaim.title} (${input.attachedClaim.kind}, ${input.attachedClaim.domain})
Claim statement: ${input.attachedClaim.statement}

Question: ${input.question}
Resolution date: ${input.resolutionDate}
Resolution criteria: ${input.resolutionCriteria}

Return a single JSON object on a single line, no markdown fence, no commentary:
{"probability": <number in [0,1]>, "reasoning": "<concise 1-3 sentence rationale citing base rates or specific indicators>"}`;
}

export type RawPrediction = {
  probability: number;
  reasoning: string;
};

/**
 * Parses raw model output as JSON. Tolerates a leading code-fence the model
 * might emit despite the instruction; tolerates trailing whitespace. Throws
 * with a snippet on malformed output so the orchestrator can report which
 * provider misbehaved.
 */
export function parseRawPrediction(text: string): RawPrediction {
  let body = text.trim();
  if (body.startsWith("\`\`\`")) {
    body = body.replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
  }
  const match = body.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`forecaster output is not JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(match[0]) as { probability?: unknown; reasoning?: unknown };
  if (typeof obj.probability !== "number" || obj.probability < 0 || obj.probability > 1) {
    throw new Error(`forecaster probability out of range: ${JSON.stringify(obj)}`);
  }
  if (typeof obj.reasoning !== "string" || obj.reasoning.trim().length === 0) {
    throw new Error(`forecaster reasoning missing or empty: ${JSON.stringify(obj)}`);
  }
  return { probability: obj.probability, reasoning: obj.reasoning };
}
