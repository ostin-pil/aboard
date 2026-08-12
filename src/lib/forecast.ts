import type { Prediction } from "./types";

/**
 * Forecast aggregation primitives.
 *
 * Pure functions only — no I/O, no React, no loader imports. The ensemble
 * "interpretation" surface (median + spread + leave-one-out) is the project's
 * hero diagnostic: it's what makes an ensemble *reversal* (e.g. F4, where one
 * model variant lands far from the pack) legible instead of hidden behind a
 * single averaged number.
 */

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/**
 * Median of a list of numbers. Even-length lists average the two central
 * values. Returns 0 for an empty list (callers gate UI on `count`).
 *
 * Median (not mean) is the headline statistic because it is robust to one
 * miscalibrated provider: a single model that lands far from the pack should
 * not drag the aggregate, and the *gap* between that model and the median is
 * itself the interesting signal (surfaced via `leaveOneOut`).
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[Math.floor(mid)];
}

/**
 * Spread = max − min (full range).
 *
 * Choice rationale: with typical ensembles of 4–6 model predictions, IQR
 * collapses to a near-degenerate window (it would discard exactly the
 * tail observations that signal disagreement). The whole point of the
 * spread number is to make "four models agree at 0.5" visibly different
 * from "four models range 0.15–0.85" — full range preserves that contrast;
 * IQR would erase it. For larger n a switch to IQR could be revisited, but
 * the data we have is small-n by construction.
 *
 * Returns 0 for empty or single-element input.
 */
export function spread(values: number[]): number {
  if (values.length === 0) return 0;
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

// ---------------------------------------------------------------------------
// aggregate — public API consumed by src/app/claims/[id]/page.tsx
// ---------------------------------------------------------------------------

export type AggregateStats = {
  median: number;
  mean: number;
  spread: number; // max − min
  count: number;
  min: number;
  max: number;
};

/**
 * Aggregate ensemble predictions into a single headline probability plus the
 * spread (max − min). Spread is critical: four models agreeing at 0.5 is a
 * very different signal from four models ranging 0.15–0.85, but a naive mean
 * conflates them.
 *
 * Median is the default headline because it's robust to one outlier provider
 * (a model that fails calibration entirely shouldn't dominate the aggregate).
 *
 * Returns `count: 0` and zeros elsewhere for an empty input — callers should
 * gate UI on `count > 1` to decide whether to render the ensemble surface.
 *
 * NOTE: return shape is a stable public contract (read by the claim detail
 * page). Do not change keys; extend with new exported primitives instead.
 */
export function aggregate(predictions: Prediction[]): AggregateStats {
  if (predictions.length === 0) {
    return { median: 0, mean: 0, spread: 0, count: 0, min: 0, max: 0 };
  }
  const values = predictions.map((p) => p.probability);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    median: median(values),
    mean,
    spread: spread(values),
    count: values.length,
    min,
    max,
  };
}

// ---------------------------------------------------------------------------
// leaveOneOut — the key diagnostic for an ensemble reversal
// ---------------------------------------------------------------------------

type LeaveOneOutEntry = {
  /** Index of the dropped prediction in the original `predictions` array. */
  droppedIndex: number;
  /** Model id of the dropped prediction (provenance only — NOT a key). */
  droppedAgent: string;
  /** Probability of the dropped prediction. */
  droppedProbability: number;
  /** Median recomputed with this prediction removed. */
  medianWithout: number;
  /** medianWithout − baselineMedian. Sign shows which way the drop moves it. */
  deltaFromBaseline: number;
};

export type LeaveOneOutResult = {
  /** Median over all predictions (the unperturbed baseline). */
  baselineMedian: number;
  entries: LeaveOneOutEntry[];
};

/**
 * Recompute the aggregate (median) with each model dropped in turn, returning
 * the per-dropped-model delta. This is the diagnostic that makes an ensemble
 * reversal legible: if dropping a single model swings the median far, the
 * "consensus" was actually that one model carrying the result.
 *
 * Entries are keyed by ORIGINAL INDEX, never by model id or probability:
 * model strings can repeat across runs and probabilities can tie (F4 has two
 * predictions at 0.40), so an id/value-keyed map would silently lose entries.
 *
 * Empty/single-element input yields no entries (nothing to drop meaningfully).
 */
export function leaveOneOut(predictions: Prediction[]): LeaveOneOutResult {
  const values = predictions.map((p) => p.probability);
  const baselineMedian = median(values);
  if (predictions.length < 2) {
    return { baselineMedian, entries: [] };
  }
  const entries: LeaveOneOutEntry[] = predictions.map((p, i) => {
    const without = values.filter((_, j) => j !== i);
    const medianWithout = median(without);
    return {
      droppedIndex: i,
      droppedAgent: p.agent.agent,
      droppedProbability: p.probability,
      medianWithout,
      deltaFromBaseline: medianWithout - baselineMedian,
    };
  });
  return { baselineMedian, entries };
}

// ---------------------------------------------------------------------------
// simulatedN — deterministic subsample aggregate
// ---------------------------------------------------------------------------

/**
 * mulberry32: a tiny, fast, well-distributed 32-bit seeded PRNG. Chosen
 * because the subsample must be deterministic and reproducible (same seed +
 * same inputs ⇒ same result) without pulling in a dependency. Returns a
 * generator producing floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default PRNG seed for `simulatedN`. Documented constant ⇒ reproducible. */
export const SIMULATED_N_DEFAULT_SEED = 0x5eed;

export type SimulatedNResult = {
  /** Number actually sampled (clamped to [0, predictions.length]). */
  sampledCount: number;
  /** Original indices that were drawn, in draw order. */
  sampledIndices: number[];
  /** Aggregate over the sampled subset. */
  stats: AggregateStats;
};

/**
 * Deterministic-seeded subsample aggregate: draw `n` predictions WITHOUT
 * replacement using a seeded Fisher–Yates partial shuffle, then aggregate the
 * subset. Same `(predictions, n, seed)` always yields the same draw — this is
 * a reproducibility tool ("what would the headline look like with only 3 of
 * the 5 models?"), not a Monte Carlo estimator.
 *
 * Seeding: mulberry32 seeded from `seed` (default `SIMULATED_N_DEFAULT_SEED`).
 * `n` is clamped to [0, predictions.length]; n ≤ 0 or empty input ⇒ empty
 * stats. Selection order is the shuffle order; the aggregate itself is
 * order-independent.
 */
export function simulatedN(
  predictions: Prediction[],
  n: number,
  seed: number = SIMULATED_N_DEFAULT_SEED,
): SimulatedNResult {
  const total = predictions.length;
  const k = Math.max(0, Math.min(Math.floor(n), total));
  if (k === 0) {
    return {
      sampledCount: 0,
      sampledIndices: [],
      stats: aggregate([]),
    };
  }
  const rand = mulberry32(seed);
  const indices = predictions.map((_, i) => i);
  // Partial Fisher–Yates: only the first k slots need to be finalized.
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (total - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  const sampledIndices = indices.slice(0, k);
  const subset = sampledIndices.map((i) => predictions[i]);
  return {
    sampledCount: k,
    sampledIndices,
    stats: aggregate(subset),
  };
}

// ---------------------------------------------------------------------------
// framingVariantGroups — DATA GAP (see report)
// ---------------------------------------------------------------------------

export type FramingVariantGroup = {
  framing: string;
  predictionIndices: number[];
};

/**
 * Group predictions by framing/variant metadata.
 *
 * DATA GAP: the Prediction schema (src/lib/types.ts) carries NO framing or
 * variant field. `agent.promptTitle` is prompt *provenance* ("Seed claim
 * author v0.1" vs "ensemble-forecaster-v0.1") and `agent.agent` is *model
 * identity* — neither is a framing axis, and conflating them here would
 * fabricate a dimension the data does not contain.
 *
 * This function therefore returns an EMPTY grouping by design. The signature
 * is preserved so a future schema addition (e.g. `Prediction.framing`) can
 * populate it without a call-site change. Until the schema gains an explicit
 * framing field, framing-variant analysis cannot be derived — see report.
 */
export function framingVariantGroups(
  _predictions: Prediction[],
): FramingVariantGroup[] {
  // Intentionally empty: no framing/variant metadata exists in the data.
  return [];
}
