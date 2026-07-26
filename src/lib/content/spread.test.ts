import { describe, expect, it } from "vitest";
import type { Forecast, Prediction } from "@/lib/types";
import { ENSEMBLE_MIN_PREDICTIONS, spreadRows } from "./spread";

/**
 * Behaviour of the derivation, on fixtures rather than on `data/`. The shipped
 * forecasts are checked in `content.test.ts`; what matters here is that the
 * gate, the ordering and both directions of the readings check hold for inputs
 * the repo does not happen to contain yet.
 */

const prediction = (probability: number): Prediction => ({
  agent: { agent: "m", promptTitle: "p", generatedAt: "2026-01-01T00:00:00Z" },
  probability,
  reasoning: "r",
  baseRates: [],
  dataAnchors: [],
  createdAt: "2026-01-01T00:00:00Z",
});

const forecast = (id: string, probabilities: number[]): Forecast => ({
  id,
  attachedToClaimId: "M1",
  question: "q",
  resolutionDate: "2027-12-31",
  resolutionCriteria: "c",
  predictions: probabilities.map(prediction),
});

describe("spreadRows", () => {
  it("derives median and spread to two decimals", () => {
    const rows = spreadRows([forecast("F1", [0.35, 0.6, 0.72])], { F1: "r" }, "d.md");
    expect(rows).toEqual([{ id: "F1", median: "0.60", spread: "0.37", reading: "r" }]);
  });

  it("carries the authored reading through untouched", () => {
    const rows = spreadRows([forecast("F1", [0.1, 0.2])], { F1: "Was 0.02 with N=3." }, "d.md");
    expect(rows[0].reading).toBe("Was 0.02 with N=3.");
  });

  it(`omits forecasts with fewer than ${ENSEMBLE_MIN_PREDICTIONS} predictions`, () => {
    const rows = spreadRows(
      [forecast("F1", [0.1, 0.2]), forecast("IF1", [0.35]), forecast("F2", [])],
      { F1: "r" },
      "d.md",
    );
    expect(rows.map((r) => r.id)).toEqual(["F1"]);
  });

  it("orders ids numerically, so F10 follows F2", () => {
    const rows = spreadRows(
      [forecast("F10", [0.1, 0.2]), forecast("F2", [0.1, 0.2])],
      { F2: "r", F10: "r" },
      "d.md",
    );
    expect(rows.map((r) => r.id)).toEqual(["F2", "F10"]);
  });

  it("throws when an ensemble forecast has no reading", () => {
    expect(() =>
      spreadRows([forecast("F1", [0.1, 0.2]), forecast("F2", [0.3, 0.4])], { F1: "r" }, "about.md"),
    ).toThrow(/about\.md[\s\S]*F2/);
  });

  it("throws when a reading has no forecast behind it", () => {
    expect(() => spreadRows([forecast("F1", [0.1, 0.2])], { F1: "r", F9: "r" }, "about.md")).toThrow(
      /about\.md[\s\S]*F9/,
    );
  });

  it("treats a single-prediction forecast's reading as orphaned, not as missing", () => {
    expect(() => spreadRows([forecast("IF1", [0.35])], { IF1: "r" }, "about.md")).toThrow(
      /IF1[\s\S]*not an ensemble/,
    );
  });

  it("returns nothing when there are no ensembles and no readings", () => {
    expect(spreadRows([forecast("IF1", [0.35])], {}, "d.md")).toEqual([]);
  });
});
