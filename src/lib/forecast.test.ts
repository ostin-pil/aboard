import { describe, it, expect } from "vitest";
import {
  median,
  spread,
  aggregate,
  leaveOneOut,
  simulatedN,
  framingVariantGroups,
  SIMULATED_N_DEFAULT_SEED,
} from "@/lib/forecast";
import type { Prediction } from "@/lib/types";

/**
 * The forecast primitives.
 *
 * Ported from `scripts/forecast-sanity.ts`, which session 7 wrote as a
 * pure-assertion script because "no test framework exists in this repo". One
 * has existed since; the script outlived the reason for its shape and ran
 * nowhere in the gate, so 30 assertions over the module the whole predictions
 * module rests on were sitting one manual `npx tsx` away from being checked.
 * The script is deleted rather than kept alongside this: two copies of the same
 * assertions is the duplication-drift this repo keeps finding, and only one of
 * them would have run.
 *
 * Fixtures stay inline. The loader is `server-only` and importing it here would
 * pull the Next runtime into vitest, which `vitest.config.ts` explicitly avoids.
 */

/** Only the fields the math reads matter. */
function pred(probability: number, agent: string): Prediction {
  return {
    agent: { agent, generatedAt: "2026-01-01T00:00:00Z" },
    probability,
    reasoning: "fixture",
    baseRates: [],
    dataAnchors: [],
    createdAt: "2026-01-01T00:00:00Z",
  };
}

/**
 * The real probabilities from `data/democratic_backsliding/forecasts/F4.yaml`,
 * including the qwen 0.65 outlier and the two tied 0.40 predictions. F4 is the
 * hero case because it is a spread-and-outlier story: the disagreement is the
 * finding, and the median is what refuses to be dragged by it.
 */
const F4: Prediction[] = [
  pred(0.35, "claude-opus-4-7"),
  pred(0.4, "groq-llama-3.3-70b"),
  pred(0.4, "groq-llama-4-scout"),
  pred(0.42, "groq-gpt-oss-120b"),
  pred(0.65, "groq-qwen-3-32b"),
];

/** The script's `approx` used eps 1e-9; this is the vitest equivalent. */
const PRECISION = 10;

describe("median", () => {
  it("takes the middle of an odd-length set", () => {
    expect(median([0.35, 0.4, 0.4, 0.42, 0.65])).toBeCloseTo(0.4, PRECISION);
  });

  it("averages the two middles of an even-length set", () => {
    expect(median([0.1, 0.2, 0.3, 0.4])).toBeCloseTo(0.25, PRECISION);
  });

  it("handles a single value", () => {
    expect(median([0.7])).toBeCloseTo(0.7, PRECISION);
  });

  it("returns 0 for an empty set", () => {
    expect(median([])).toBe(0);
  });

  it("sorts its input rather than trusting the caller", () => {
    expect(median([0.65, 0.35, 0.42, 0.4, 0.4])).toBeCloseTo(0.4, PRECISION);
  });
});

describe("spread", () => {
  it("is max minus min", () => {
    expect(spread([0.35, 0.4, 0.4, 0.42, 0.65])).toBeCloseTo(0.3, PRECISION);
  });

  it("is 0 for a single value", () => {
    expect(spread([0.5])).toBe(0);
  });

  it("is 0 for an empty set", () => {
    expect(spread([])).toBe(0);
  });
});

describe("aggregate", () => {
  const agg = aggregate(F4);

  it("reports the count", () => {
    expect(agg.count).toBe(5);
  });

  // The headline: the ensemble median is 0.40, not the 0.65 the loudest
  // forecaster wanted. A mean would have reported 0.444.
  it("medians to 0.40, not to the outlier", () => {
    expect(agg.median).toBeCloseTo(0.4, PRECISION);
  });

  it("reports min, max and spread", () => {
    expect(agg.min).toBeCloseTo(0.35, PRECISION);
    expect(agg.max).toBeCloseTo(0.65, PRECISION);
    expect(agg.spread).toBeCloseTo(0.3, PRECISION);
  });

  it("reports the mean alongside, which the outlier does drag", () => {
    expect(agg.mean).toBeCloseTo((0.35 + 0.4 + 0.4 + 0.42 + 0.65) / 5, PRECISION);
  });

  it("zeroes cleanly on an empty set", () => {
    const empty = aggregate([]);
    expect(empty.count).toBe(0);
    expect(empty.median).toBe(0);
    expect(empty.spread).toBe(0);
  });
});

describe("leaveOneOut, the F4 robustness diagnostic", () => {
  const loo = leaveOneOut(F4);

  it("keeps the baseline median and one entry per prediction", () => {
    expect(loo.baselineMedian).toBeCloseTo(0.4, PRECISION);
    expect(loo.entries).toHaveLength(5);
  });

  it("keys entries by their original index", () => {
    expect(loo.entries.every((e, i) => e.droppedIndex === i)).toBe(true);
  });

  // Dropping the 0.65 outlier leaves [0.35, 0.4, 0.4, 0.42], median 0.40. The
  // median does not move at all. That is the robustness claim, tested rather
  // than asserted in prose.
  it("does not move when the 0.65 outlier is dropped", () => {
    const dropQwen = loo.entries[4];
    expect(dropQwen.medianWithout).toBeCloseTo(0.4, PRECISION);
    expect(dropQwen.deltaFromBaseline).toBeCloseTo(0, PRECISION);
  });

  // Dropping a low 0.35 leaves [0.4, 0.4, 0.42, 0.65], median 0.41.
  it("moves by 0.01 when a low prediction is dropped", () => {
    const dropOpus = loo.entries[0];
    expect(dropOpus.medianWithout).toBeCloseTo(0.41, PRECISION);
    expect(dropOpus.deltaFromBaseline).toBeCloseTo(0.01, PRECISION);
  });

  // Two predictions share 0.40. Keying by probability rather than index would
  // silently collapse them into one entry.
  it("keeps tied predictions as distinct entries", () => {
    const tied = loo.entries.filter((e) => Math.abs(e.droppedProbability - 0.4) <= 1e-9);
    expect(tied).toHaveLength(2);
  });

  it("shows the median sitting materially below the mean", () => {
    const agg = aggregate(F4);
    expect(agg.median).toBeLessThan(agg.mean);
    expect(agg.mean).toBeCloseTo(0.444, PRECISION);
  });

  it("produces no entries for a single prediction", () => {
    expect(leaveOneOut([pred(0.5, "x")]).entries).toHaveLength(0);
  });
});

describe("simulatedN", () => {
  it("samples the requested count", () => {
    expect(simulatedN(F4, 3).sampledCount).toBe(3);
  });

  // Determinism is the whole point: a published subsample a reader cannot
  // reproduce is not evidence of anything.
  it("is deterministic for the same seed", () => {
    expect(simulatedN(F4, 3).sampledIndices).toEqual(simulatedN(F4, 3).sampledIndices);
  });

  it("samples without replacement", () => {
    const { sampledIndices } = simulatedN(F4, 3);
    expect(new Set(sampledIndices).size).toBe(sampledIndices.length);
  });

  it("draws differently for a different seed", () => {
    const a = simulatedN(F4, 3);
    const b = simulatedN(F4, 3, SIMULATED_N_DEFAULT_SEED + 1);
    expect(a.sampledIndices).not.toEqual(b.sampledIndices);
  });

  it("clamps to the full set when n exceeds it", () => {
    expect(simulatedN(F4, 99).sampledCount).toBe(5);
  });

  it("matches aggregate when the sample is everything", () => {
    const full = simulatedN(F4, 5);
    const agg = aggregate(F4);
    expect(full.stats.median).toBeCloseTo(agg.median, PRECISION);
    expect(full.stats.spread).toBeCloseTo(agg.spread, PRECISION);
  });

  it("returns empty stats for n = 0", () => {
    expect(simulatedN(F4, 0).stats.count).toBe(0);
  });

  it("keeps subset stats internally consistent", () => {
    const { stats } = simulatedN(F4, 3);
    expect(stats.median).toBeGreaterThanOrEqual(stats.min);
    expect(stats.median).toBeLessThanOrEqual(stats.max);
  });
});

describe("framingVariantGroups", () => {
  // Empty by design, not by accident: nothing in the schema records which
  // framing a prediction answered, so there is nothing to group by. The
  // function exists so the gap is visible in code rather than only in prose.
  it("returns nothing while the schema carries no framing metadata", () => {
    expect(framingVariantGroups(F4)).toHaveLength(0);
  });
});
