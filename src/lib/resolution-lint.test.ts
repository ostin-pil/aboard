import { describe, it, expect } from "vitest";
import {
  lintForecast,
  lintForecasts,
  type LintableForecast,
  type ResolutionRule,
} from "@/lib/resolution-lint";

/** A forecast that passes every rule, so each test can break exactly one. */
const clean = (over: Partial<LintableForecast> = {}): LintableForecast => ({
  id: "T1",
  resolutionCriteria:
    "Resolves YES if the published index rises by at least 2 points " +
    "relative to the 2024 baseline.",
  resolutionSource: {
    label: "Example Statistical Series",
    url: "https://example.org/series",
    kind: "dataset",
  },
  ...over,
});

const rules = (f: LintableForecast): ResolutionRule[] =>
  lintForecast(f).map((x) => x.rule);

describe("lintForecast", () => {
  it("passes a forecast with a threshold and an external source", () => {
    expect(lintForecast(clean())).toEqual([]);
  });

  describe("says-trigger", () => {
    // The rule exists because a speech act is gameable by whoever can prompt
    // the speech; the outcome behind it is not.
    it.each([
      "Resolves YES if the President says the programme has ended.",
      "Resolves YES if the agency announces a figure above 50.",
      "Resolves YES if the minister declared the target met by 2027.",
      "Resolves YES if the chief executive tweets a number over 10.",
      "Resolves YES if the report states that 3 of 5 targets were met.",
    ])("flags %j", (resolutionCriteria) => {
      expect(rules(clean({ resolutionCriteria }))).toContain("says-trigger");
    });

    it("does not fire on ordinary reporting verbs", () => {
      const resolutionCriteria =
        "Resolves YES if the published series shows a rise of at least 2 points.";
      expect(rules(clean({ resolutionCriteria }))).not.toContain("says-trigger");
    });

    it("does not fire on the word 'claims', which is domain vocabulary", () => {
      const resolutionCriteria =
        "Resolves YES if at least 3 claims in the domain are superseded.";
      expect(rules(clean({ resolutionCriteria }))).not.toContain("says-trigger");
    });

    it("does not fire on 'United States'", () => {
      const resolutionCriteria =
        "Resolves YES if the United States records more than 5 such filings.";
      expect(rules(clean({ resolutionCriteria }))).not.toContain("says-trigger");
    });
  });

  describe("no-threshold", () => {
    it("flags criteria with no number, glyph, or quantifier", () => {
      const resolutionCriteria =
        "Resolves YES if a binding statute requiring documented auditing is passed.";
      expect(rules(clean({ resolutionCriteria }))).toContain("no-threshold");
    });

    it.each([
      "Resolves YES if the index rises by ≥2 points.",
      "Resolves YES if the share exceeds 50%.",
      "Resolves YES if a majority of member countries deteriorate.",
      "Resolves YES if at least one metro clears the bar.",
    ])("accepts %j", (resolutionCriteria) => {
      expect(rules(clean({ resolutionCriteria }))).not.toContain("no-threshold");
    });
  });

  describe("no-source", () => {
    it("flags a forecast with no resolutionSource", () => {
      expect(rules(clean({ resolutionSource: undefined }))).toContain(
        "no-source"
      );
    });
  });

  it("reports every broken rule at once", () => {
    const f = clean({
      resolutionCriteria: "Resolves YES if the chair announces success.",
      resolutionSource: undefined,
    });
    expect(rules(f).sort()).toEqual([
      "no-source",
      "no-threshold",
      "says-trigger",
    ]);
  });

  it("names the forecast in every finding", () => {
    const f = clean({ id: "F9", resolutionSource: undefined });
    for (const finding of lintForecast(f)) {
      expect(finding.forecastId).toBe("F9");
    }
  });
});

describe("lintForecasts", () => {
  it("returns findings across a corpus in order", () => {
    const findings = lintForecasts([
      clean({ id: "A" }),
      clean({ id: "B", resolutionSource: undefined }),
      clean({ id: "C" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ forecastId: "B", rule: "no-source" });
  });

  it("is empty for an empty corpus", () => {
    expect(lintForecasts([])).toEqual([]);
  });
});
