import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CANONICAL_ORIGIN, siteHost } from "./site";
import { JSONLD_CONTEXT, SCHEMA_URL, VOCAB_ORIGIN } from "./vocab";

/**
 * Guards the canonical-URL invariants. Two published representations of the
 * graph once disagreed on identity IRIs (a dead `aboard.dev` in the OG cards
 * and the client export) while every social unfurl pointed at localhost. Both
 * were invisible to type-checking and to the schema validator: rasterized text
 * and a client-only code path. These are the checks that make them loud.
 */

const SRC = join(process.cwd(), "src");

/** Files allowed to spell an origin literal — the single sources of truth. */
const ORIGIN_ALLOWLIST = new Set(["lib/site.ts", "lib/vocab.ts"]);

const CODE_EXT = new Set([".ts", ".tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return CODE_EXT.has(extname(entry.name)) ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((full) => ({
  rel: relative(SRC, full).split("\\").join("/"),
  text: readFileSync(full, "utf8"),
}));

/**
 * Shipped source only. Test files are excluded throughout: they must be able to
 * name the strings they ban (this file does), and nothing here is published.
 */
const shipped = files.filter((f) => !f.rel.endsWith(".test.ts"));

describe("canonical URLs", () => {
  it("has source files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never mentions the dead aboard.dev domain", () => {
    const offenders = shipped.filter((f) => f.text.includes("aboard.dev")).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("confines origin literals to site.ts and vocab.ts", () => {
    const offenders = shipped
      .filter((f) => !ORIGIN_ALLOWLIST.has(f.rel))
      .filter((f) => /https?:\/\/aboard\./.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  // Localhost in *source* is legitimate — `about/page.tsx` and the export
  // pack's README both tell a developer to validate against their dev server.
  // The invariant that matters is that no localhost URL survives into the
  // build, which `scripts/check-built-urls.mjs` asserts over `out/` in CI.

  it("publishes one vocabulary across both JSON-LD dialects", () => {
    const clientExport = files.find((f) => f.rel === "components/graph/jsonld-export.ts");
    expect(clientExport).toBeDefined();
    // The client export must reuse the shared context, not re-spell an IRI.
    expect(clientExport?.text).toContain("JSONLD_CONTEXT");
    expect(JSONLD_CONTEXT.aboard.startsWith(VOCAB_ORIGIN)).toBe(true);
    expect(SCHEMA_URL).toBe(`${VOCAB_ORIGIN}/schema/v0.json`);
  });

  it("derives the OG card host from the site base, with no scheme", () => {
    expect(siteHost()).not.toMatch(/^https?:\/\//);
    expect(siteHost()).toBe(CANONICAL_ORIGIN.replace(/^https?:\/\//, ""));
  });

  it("sets metadataBase in the root layout", () => {
    const layout = files.find((f) => f.rel === "app/layout.tsx");
    expect(layout?.text).toMatch(/metadataBase:\s*new URL\(siteBaseUrl\(\)\)/);
  });
});
