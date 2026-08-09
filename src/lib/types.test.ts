import { describe, it, expect } from "vitest";
import { HttpUrl, Source } from "@/lib/types";

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
