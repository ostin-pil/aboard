import { describe, it, expect } from "vitest";
import { Claim, Forecast, HttpUrl, Iso8601, Source } from "@/lib/types";

/**
 * Schema-level guards for the constraints that are easy to state and easy to
 * lose. `Source.url` was a bare `z.string().url()`, which accepts
 * `javascript:`, `data:` and `vbscript:` — that was verified by execution
 * before it was fixed, and this is the test that keeps it fixed.
 */

const UNSAFE = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
];

const SAFE = [
  "https://v-dem.net/publications/democracy-reports/",
  "http://example.org",
  "HTTPS://Example.org/Path?q=1#frag",
];

describe("HttpUrl", () => {
  it.each(UNSAFE)("rejects %s", (url) => {
    expect(HttpUrl.safeParse(url).success).toBe(false);
  });

  it.each(SAFE)("accepts %s", (url) => {
    expect(HttpUrl.safeParse(url).success).toBe(true);
  });

  it("rejects a non-URL string outright", () => {
    expect(HttpUrl.safeParse("not a url").success).toBe(false);
    expect(HttpUrl.safeParse("").success).toBe(false);
  });
});

/**
 * Timestamps were bare `z.string()` until session 50, so the loader accepted
 * anything and the disagreement with `public/schema/v0.json` only surfaced as
 * an Ajv error at the tail of CI. The pattern here is a copy of the schema's
 * `$defs/Iso8601`; these cases are what keep the copy honest.
 */
describe("Iso8601", () => {
  it.each([
    "2026-08-09T00:00:00Z",
    "2026-05-11T20:18:51.520Z",
    "2026-08-09T12:30:00+02:00",
    "2026-08-09T12:30:00",
    "2027-01-31",
  ])("accepts %s", (value) => {
    expect(Iso8601.safeParse(value).success).toBe(true);
  });

  it.each([
    "last Tuesday",
    "",
    "2026",
    "2026-8-9",
    "09-08-2026",
    "2026-08-09 12:30:00",
    "2026-08-09T12:30Z",
    "  2026-08-09T00:00:00Z  ",
  ])("rejects %s", (value) => {
    expect(Iso8601.safeParse(value).success).toBe(false);
  });

  /**
   * The audit proposed `z.iso.datetime()`, which requires a time component.
   * Every `resolutionDate` in `data/` is a bare calendar date, so that would
   * have rejected the entire corpus. This is the case that says why the
   * pattern is deliberately permissive.
   */
  it("accepts a date-only resolutionDate, as every forecast in data/ uses", () => {
    const forecast = {
      id: "F1",
      attachedToClaimId: "S1",
      question: "Will it?",
      resolutionDate: "2027-01-31",
      resolutionCriteria: "Resolves YES if it does.",
      predictions: [],
    };
    expect(Forecast.safeParse(forecast).success).toBe(true);
  });

  it("refuses a claim whose createdAt is not a date at all", () => {
    const claim = {
      id: "S1",
      kind: "symptom",
      title: "A claim",
      statement: "A statement.",
      domain: "democratic_backsliding",
      confidence: 0.5,
      sources: [],
      authoredBy: { agent: "a", generatedAt: "2026-08-09T00:00:00Z" },
      createdAt: "last Tuesday",
    };
    const parsed = Claim.safeParse(claim);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["createdAt"]);
    }
  });
});

describe("Source", () => {
  const base = { label: "V-Dem", kind: "dataset" as const };

  it("refuses a source whose URL carries an unsafe scheme", () => {
    const parsed = Source.safeParse({ ...base, url: "javascript:alert(1)" });
    expect(parsed.success).toBe(false);
  });

  it("accepts a real landing page", () => {
    const parsed = Source.safeParse({ ...base, url: "https://v-dem.net/" });
    expect(parsed.success).toBe(true);
  });
});
