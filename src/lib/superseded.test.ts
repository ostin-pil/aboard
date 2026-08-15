import { describe, it, expect } from "vitest";

import { replacements, joinIds, supersededLine } from "./superseded";
import type { Forecast } from "./types";

/**
 * Fixtures mirror the two supersessions actually filed: F4 replaced by F7 on
 * claim M4, and F5 replaced by both F6 and F8 on L3. The cross-claim and
 * dangling cases are not in `data/` and cannot be, since `integrity.ts` rejects
 * an unknown id, but both are reachable shapes for this pure function and the
 * cross-claim one is what the link target exists for.
 */
function forecast(id: string, attachedToClaimId: string, supersededBy?: string[]): Forecast {
  return {
    id,
    attachedToClaimId,
    question: `question for ${id}`,
    resolutionDate: "2027-12-31",
    resolutionCriteria: "criteria",
    predictions: [],
    ...(supersededBy ? { supersededBy } : {}),
  } as Forecast;
}

const F4 = forecast("F4", "M4", ["F7"]);
const F5 = forecast("F5", "L3", ["F6", "F8"]);
const F7 = forecast("F7", "M4");
const F6 = forecast("F6", "L3");
const F8 = forecast("F8", "L3");
const ALL = [F4, F5, F6, F7, F8];

describe("replacements", () => {
  it("returns nothing for a live forecast", () => {
    expect(replacements(F7, ALL)).toEqual([]);
  });

  it("resolves a single replacement to its claim", () => {
    expect(replacements(F4, ALL)).toEqual([{ id: "F7", claimId: "M4" }]);
  });

  it("preserves the filed order of several replacements", () => {
    expect(replacements(F5, ALL)).toEqual([
      { id: "F6", claimId: "L3" },
      { id: "F8", claimId: "L3" },
    ]);
  });

  it("resolves a replacement attached to a different claim", () => {
    const crossClaim = forecast("FX", "M1", ["F7"]);
    expect(replacements(crossClaim, [...ALL, crossClaim])).toEqual([
      { id: "F7", claimId: "M4" },
    ]);
  });

  it("reports a dangling id as null rather than dropping it", () => {
    const dangling = forecast("FY", "M1", ["GONE"]);
    expect(replacements(dangling, ALL)).toEqual([{ id: "GONE", claimId: null }]);
  });
});

describe("joinIds", () => {
  it("returns an empty string for no ids", () => {
    expect(joinIds([])).toBe("");
  });

  it("returns a lone id unadorned", () => {
    expect(joinIds(["F7"])).toBe("F7");
  });

  it("joins two with and", () => {
    expect(joinIds(["F6", "F8"])).toBe("F6 and F8");
  });

  it("joins three without a serial comma", () => {
    expect(joinIds(["F6", "F8", "F9"])).toBe("F6, F8 and F9");
  });
});

describe("supersededLine", () => {
  it("is empty for a live forecast", () => {
    expect(supersededLine(F7, ALL)).toBe("");
  });

  it("names one replacement", () => {
    expect(supersededLine(F4, ALL)).toBe("Superseded, replaced by F7.");
  });

  it("names several replacements", () => {
    expect(supersededLine(F5, ALL)).toBe("Superseded, replaced by F6 and F8.");
  });
});
