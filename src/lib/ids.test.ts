import { describe, it, expect } from "vitest";
import { nextSequentialId, idStem, inferDomainPrefix } from "@/lib/ids";

// The three real domains' claim ids, as `data/` holds them. Duplicated from
// proposals.test.ts rather than shared: both files assert against what is on
// disk, and a shared fixture module would let one of them drift from `data/`
// while still agreeing with the other.
const DB_IDS = ["S1", "S2", "S3", "M1", "M2", "M3", "M4", "M5", "L1", "L2", "L3", "L4"];
const INEQ_IDS = ["IS1", "IS2", "IM1", "IM2", "IM3", "IL1", "IL2", "IL3"];
const EC_IDS = ["ECS1", "ECM1", "ECL1"];

describe("nextSequentialId", () => {
  it("takes the max for the stem and adds one", () => {
    expect(nextSequentialId("E", ["E1", "E12", "E3"])).toBe("E13");
  });

  it("starts at 1 for an unused stem", () => {
    expect(nextSequentialId("CE", [])).toBe("CE1");
  });

  // Anchoring matters: stem "E" must not swallow "IE7" or "CE1", or the
  // democratic_backsliding edge sequence would leap past ids it does not own.
  it("anchors the stem so one prefix does not consume another's ids", () => {
    expect(nextSequentialId("E", ["E1", "IE7", "ECE2", "CE3"])).toBe("E2");
    expect(nextSequentialId("CE", ["ECE2", "CE3"])).toBe("CE4");
  });

  it("ignores ids on the stem that do not end in digits", () => {
    expect(nextSequentialId("E", ["E", "Efoo", "E2x", "E4"])).toBe("E5");
  });

  // The regression E15 named. The old form interpolated the stem into a
  // pattern, so a metacharacter changed what "on this stem" meant: `E.` matched
  // `E1` (dot is any character) and minted `E.2` over an id already in use, and
  // an unbalanced stem threw SyntaxError out of the mint itself.
  it("treats a stem carrying regex metacharacters as literal text", () => {
    expect(nextSequentialId("E.", ["E1", "E2"])).toBe("E.1");
    expect(nextSequentialId("E.", ["E.3"])).toBe("E.4");
    expect(() => nextSequentialId("E(", ["E1"])).not.toThrow();
    expect(nextSequentialId("E(", ["E1"])).toBe("E(1");
  });
});

describe("idStem", () => {
  it("strips the trailing sequence", () => {
    expect(idStem("E12")).toBe("E");
    expect(idStem("ECE3")).toBe("ECE");
    expect(idStem("CE1")).toBe("CE");
  });

  it("refuses an id that does not end in digits", () => {
    expect(idStem("E")).toBeNull();
    expect(idStem("not-an-id")).toBeNull();
  });
});

describe("inferDomainPrefix", () => {
  it("reads the prefix off each real domain in data/", () => {
    expect(inferDomainPrefix(DB_IDS)).toBe("");
    expect(inferDomainPrefix(INEQ_IDS)).toBe("I");
    expect(inferDomainPrefix(EC_IDS)).toBe("EC");
  });

  // Refusals, not guesses. Minting under a wrong prefix would silently fork a
  // domain's namespace, and nothing downstream would notice.
  it("refuses when the domain has no claims yet", () => {
    expect(inferDomainPrefix([])).toBeNull();
  });

  it("refuses when a domain's ids disagree on a prefix", () => {
    expect(inferDomainPrefix(["S1", "IM2"])).toBeNull();
  });

  it("refuses ids that do not follow the convention", () => {
    expect(inferDomainPrefix(["not-an-id"])).toBeNull();
    expect(inferDomainPrefix(["X1"])).toBeNull(); // X is not a kind letter
  });
});
