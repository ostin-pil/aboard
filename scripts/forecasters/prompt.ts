/**
 * Shared forecaster prompt. Extracted from the original
 * `scripts/generate-prediction.ts` (Anthropic-only path); now used by every
 * provider in the ensemble. Single prompt across model families is a feature,
 * not a bug — disagreement under identical input is the signal we want to
 * measure.
 */

export const FORECASTER_PROMPT = `You are a calibrated forecaster aiding a project that publishes machine-readable JSON-LD claims about civilizational risks. Each claim has an attached forecast with a binary resolution criterion.

Your job: read the forecast question and resolution criteria, identify one or more historical base rates relevant to the question, optionally cite specific datasets or studies that anchor your reasoning, and return a single probability that the forecast resolves YES. Aim for calibration over confidence — if you do not know, return a probability near 0.5. The forecast will be scored against ground truth using the Brier score; overconfident predictions are penalized quadratically.

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

Return a single JSON object, no markdown fence, no commentary. Shape:
{
  "probability": <number in [0,1]>,
  "reasoning": "<concise 1-3 sentence rationale>",
  "baseRates": [
    {
      "question": "<historical reference question, e.g. 'how often have X-like events happened in similar setups over period Y?'>",
      "rate": <number in [0,1]>,
      "source": {"label": "<short institution/study name>", "url": "<real landing page URL>", "kind": "dataset|paper|news|policy|book|report|court|blog|statute", "finding": "<one-line note on what we cite from this source>"}
    }
  ],
  "dataAnchors": [
    {"label": "<short institution/study name>", "url": "<real landing page URL>", "kind": "dataset|paper|news|policy|book|report|court|blog|statute", "finding": "<one-line note>"}
  ]
}

Rules:
- baseRates and dataAnchors may be empty arrays if no defensible reference exists.
- URLs must point to real landing pages — institutional homepages, dataset directories, or stable study pages. Do not fabricate URLs.
- Keep baseRates focused: 1-3 entries that materially shaped your probability. Do not list every possible reference.`;
}

export type RawPrediction = {
  probability: number;
  reasoning: string;
  baseRates: Array<{
    question: string;
    rate: number;
    source: {
      label: string;
      url: string;
      kind?: string;
      finding?: string;
    };
  }>;
  dataAnchors: Array<{
    label: string;
    url: string;
    kind?: string;
    finding?: string;
  }>;
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
  const obj = JSON.parse(match[0]) as Record<string, unknown>;
  if (typeof obj.probability !== "number" || obj.probability < 0 || obj.probability > 1) {
    throw new Error(`forecaster probability out of range: ${JSON.stringify(obj)}`);
  }
  if (typeof obj.reasoning !== "string" || obj.reasoning.trim().length === 0) {
    throw new Error(`forecaster reasoning missing or empty: ${JSON.stringify(obj)}`);
  }
  const baseRates = Array.isArray(obj.baseRates)
    ? (obj.baseRates as RawPrediction["baseRates"]).filter(
        (b) =>
          b &&
          typeof b.question === "string" &&
          typeof b.rate === "number" &&
          b.rate >= 0 &&
          b.rate <= 1 &&
          b.source &&
          typeof b.source.label === "string" &&
          typeof b.source.url === "string"
      )
    : [];
  const dataAnchors = Array.isArray(obj.dataAnchors)
    ? (obj.dataAnchors as RawPrediction["dataAnchors"]).filter(
        (a) => a && typeof a.label === "string" && typeof a.url === "string"
      )
    : [];
  return {
    probability: obj.probability,
    reasoning: obj.reasoning,
    baseRates,
    dataAnchors,
  };
}
