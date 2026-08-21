import { describe, it, expect } from "vitest";
import { nextSequentialId, idStem } from "@/lib/ids";

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
