/**
 * Runnable sanity check for src/lib/forecast.ts primitives.
 *
 *   npx tsx scripts/forecast-sanity.ts
 *
 * No test framework exists in this repo (package.json has only lint/build),
 * so this is a pure-assertion script — exits non-zero on the first failure.
 * Fixtures are inline (the loader is `server-only` and must not be imported
 * here); the F4 fixture mirrors the real probabilities in
 * data/democratic_backsliding/forecasts/F4.yaml.
 */
import {
  median,
  spread,
  aggregate,
  leaveOneOut,
  simulatedN,
  framingVariantGroups,
  SIMULATED_N_DEFAULT_SEED,
} from "../src/lib/forecast";
import type { Prediction } from "../src/lib/types";

let failures = 0;

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    process.stdout.write(`  ok  ${name}\n`);
  } else {
    failures += 1;
    process.stdout.write(`FAIL  ${name}${detail ? ` — ${detail}` : ""}\n`);
  }
}

/** Minimal Prediction factory — only fields the math reads matter. */
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

// F4 hero fixture: real probabilities from F4.yaml, including the qwen 0.65
// reversal candidate and the two tied 0.40 predictions.
const F4: Prediction[] = [
  pred(0.35, "claude-opus-4-7"),
  pred(0.4, "groq-llama-3.3-70b"),
  pred(0.4, "groq-llama-4-scout"),
  pred(0.42, "groq-gpt-oss-120b"),
  pred(0.65, "groq-qwen-3-32b"),
];

// --- median ---------------------------------------------------------------
check("median odd", approx(median([0.35, 0.4, 0.4, 0.42, 0.65]), 0.4));
check("median even", approx(median([0.1, 0.2, 0.3, 0.4]), 0.25));
check("median single", approx(median([0.7]), 0.7));
check("median empty -> 0", approx(median([]), 0));
check(
  "median unsorted input",
  approx(median([0.65, 0.35, 0.42, 0.4, 0.4]), 0.4),
);

// --- spread ---------------------------------------------------------------
check("spread range", approx(spread([0.35, 0.4, 0.4, 0.42, 0.65]), 0.3));
check("spread single -> 0", approx(spread([0.5]), 0));
check("spread empty -> 0", approx(spread([]), 0));

// --- aggregate (public contract preserved) --------------------------------
const agg = aggregate(F4);
check("aggregate.count", agg.count === 5);
check("aggregate.median == 0.40 (NOT 0.65)", approx(agg.median, 0.4));
check("aggregate.min", approx(agg.min, 0.35));
check("aggregate.max", approx(agg.max, 0.65));
check("aggregate.spread", approx(agg.spread, 0.3));
check(
  "aggregate.mean",
  approx(agg.mean, (0.35 + 0.4 + 0.4 + 0.42 + 0.65) / 5),
);
const aggEmpty = aggregate([]);
check(
  "aggregate empty -> zeros",
  aggEmpty.count === 0 && aggEmpty.median === 0 && aggEmpty.spread === 0,
);

// --- leaveOneOut: the F4 reversal diagnostic ------------------------------
const loo = leaveOneOut(F4);
check("loo.baselineMedian == 0.40", approx(loo.baselineMedian, 0.4));
check("loo has 5 entries", loo.entries.length === 5);
check(
  "loo entries keyed by original index",
  loo.entries.every((e, i) => e.droppedIndex === i),
);
// Dropping the 0.65 outlier (idx 4): remaining [0.35,0.4,0.4,0.42] -> 0.40.
// The median barely moves — that's the robustness story (median over mean).
const dropQwen = loo.entries[4];
check(
  "dropping 0.65 outlier leaves median at 0.40 (delta 0)",
  approx(dropQwen.medianWithout, 0.4) && approx(dropQwen.deltaFromBaseline, 0),
);
// Dropping a low 0.35 (idx 0): remaining [0.4,0.4,0.42,0.65] -> 0.41.
const dropOpus = loo.entries[0];
check(
  "dropping 0.35 raises median to 0.41 (delta +0.01)",
  approx(dropOpus.medianWithout, 0.41) &&
    approx(dropOpus.deltaFromBaseline, 0.01),
);
// Tie integrity: both 0.40 predictions present as distinct entries.
check(
  "tied 0.40 predictions kept as distinct entries (no map collision)",
  loo.entries.filter((e) => approx(e.droppedProbability, 0.4)).length === 2,
);
// Contrast: mean would have been dragged by the 0.65; show median's value.
const meanF4 = agg.mean;
check(
  "median (0.40) materially below mean — outlier-robustness is real",
  agg.median < meanF4 && approx(meanF4, 0.444),
);
check("loo single-element -> no entries", leaveOneOut([pred(0.5, "x")]).entries.length === 0);

// --- simulatedN: determinism ----------------------------------------------
const s1 = simulatedN(F4, 3);
const s2 = simulatedN(F4, 3);
check("simulatedN sampledCount == 3", s1.sampledCount === 3);
check(
  "simulatedN deterministic (same seed -> same indices)",
  JSON.stringify(s1.sampledIndices) === JSON.stringify(s2.sampledIndices),
);
check(
  "simulatedN distinct indices (sampling without replacement)",
  new Set(s1.sampledIndices).size === s1.sampledIndices.length,
);
const sSeedB = simulatedN(F4, 3, SIMULATED_N_DEFAULT_SEED + 1);
check(
  "simulatedN different seed -> (generally) different draw",
  JSON.stringify(s1.sampledIndices) !== JSON.stringify(sSeedB.sampledIndices),
);
check(
  "simulatedN n>=total -> full set",
  simulatedN(F4, 99).sampledCount === 5,
);
const sFull = simulatedN(F4, 5);
check(
  "simulatedN full sample == aggregate over all",
  approx(sFull.stats.median, agg.median) &&
    approx(sFull.stats.spread, agg.spread),
);
check("simulatedN n=0 -> empty stats", simulatedN(F4, 0).stats.count === 0);
check(
  "simulatedN subset stats consistent (median within range)",
  s1.stats.median >= s1.stats.min && s1.stats.median <= s1.stats.max,
);

// --- framingVariantGroups: documented data gap ----------------------------
check(
  "framingVariantGroups returns empty (no framing metadata in schema)",
  framingVariantGroups(F4).length === 0,
);

// --- summary --------------------------------------------------------------
if (failures > 0) {
  process.stdout.write(`\n${failures} assertion(s) FAILED\n`);
  process.exit(1);
}
process.stdout.write("\nAll forecast primitive assertions passed.\n");
