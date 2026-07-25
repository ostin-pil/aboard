import { describe, expect, it } from "vitest";
import { markdownTwinPath, prefersMarkdown } from "./markdown-negotiation";

describe("prefersMarkdown", () => {
  it("accepts an explicit, unqualified text/markdown", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/plain")).toBe(true);
  });

  it("honours q-values on both sides", () => {
    expect(prefersMarkdown("text/markdown, text/html;q=0.9")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.9, text/html")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0, text/html")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0.5, text/html;q=0.5")).toBe(true);
  });

  it("leaves HTML the default for wildcard-only clients", () => {
    // curl's default, and anything else that has no opinion.
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("text/*")).toBe(false);
  });

  it("leaves HTML the default for browsers", () => {
    const chrome =
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
    expect(prefersMarkdown(chrome)).toBe(false);
  });

  it("prefers markdown when a wildcard would otherwise outrank it", () => {
    // The exact range wins over */* for scoring markdown; html scores 0.8 from
    // the wildcard, so the explicit ask carries.
    expect(prefersMarkdown("text/markdown, */*;q=0.8")).toBe(true);
  });

  it("treats a missing or empty header as no preference", () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown(undefined)).toBe(false);
    expect(prefersMarkdown("")).toBe(false);
  });

  it("is insensitive to case and whitespace", () => {
    expect(prefersMarkdown("  TEXT/Markdown ;Q=1 ")).toBe(true);
  });

  it("ignores a malformed q parameter rather than throwing", () => {
    expect(prefersMarkdown("text/markdown;q=banana")).toBe(true);
  });
});

describe("markdownTwinPath", () => {
  it("maps the homepage to the root twin", () => {
    expect(markdownTwinPath("/")).toBe("/index.md");
  });

  it("maps page paths to their twin", () => {
    expect(markdownTwinPath("/claims/S1")).toBe("/claims/S1/index.md");
    expect(markdownTwinPath("/dossiers/M4")).toBe("/dossiers/M4/index.md");
    expect(markdownTwinPath("/about")).toBe("/about/index.md");
  });

  it("normalizes a trailing slash", () => {
    expect(markdownTwinPath("/claims/S1/")).toBe("/claims/S1/index.md");
  });

  it("refuses paths that already name a file", () => {
    expect(markdownTwinPath("/robots.txt")).toBeNull();
    expect(markdownTwinPath("/llms.txt")).toBeNull();
    expect(markdownTwinPath("/sitemap.xml")).toBeNull();
    // A twin asking for a twin would recurse into itself.
    expect(markdownTwinPath("/claims/S1/index.md")).toBeNull();
  });

  it("refuses the JSON-LD API and build output", () => {
    expect(markdownTwinPath("/api/graph")).toBeNull();
    expect(markdownTwinPath("/api/claims/S1")).toBeNull();
    expect(markdownTwinPath("/_next/static/chunk")).toBeNull();
  });

  it("refuses well-known paths, which are machine-readable already", () => {
    expect(markdownTwinPath("/.well-known/api-catalog")).toBeNull();
  });

  it("refuses a path that is not absolute", () => {
    expect(markdownTwinPath("claims/S1")).toBeNull();
  });
});
