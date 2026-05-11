import type { Prediction } from "./types";

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
 */
export function aggregate(predictions: Prediction[]): AggregateStats {
  if (predictions.length === 0) {
    return { median: 0, mean: 0, spread: 0, count: 0, min: 0, max: 0 };
  }
  const values = predictions.map((p) => p.probability).slice().sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const mid = values.length / 2;
  const median =
    values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[Math.floor(mid)];
  return {
    median,
    mean,
    spread: max - min,
    count: values.length,
    min,
    max,
  };
}
