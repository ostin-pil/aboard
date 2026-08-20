import { describe, it, expect, vi } from "vitest";

/**
 * The loader's one testable property: listing order is the filesystem's, and
 * the loader is what makes it deterministic.
 *
 * `vitest.config.ts` says the unit project stays out of the filesystem loader
 * because it drags in `server-only` and the Next runtime, and the build covers
 * that path end to end. That argument holds for everything the loader parses —
 * the build runs the same Zod schemas over the same files and fails on the same
 * errors. It does not hold for *ordering*, because ordering is the one thing
 * the build cannot disagree with itself about: it reads `data/` once, on one
 * filesystem, and whatever order it gets is the order it validates. A loader
 * that never sorted would build green forever and still serve `/api/graph`
 * arrays in a different order on the next machine.
 *
 * So this file mocks the two modules that argument is about — `server-only` to
 * nothing, and `fs.readdirSync` to hand back the real listing reversed. The
 * reversal is what makes the test falsifiable: drop the `.sort()` from
 * `readDirIfExists` and every assertion below fails, because the loaded order
 * becomes the (reversed) filesystem order instead of the sorted one.
 */
vi.mock("server-only", () => ({}));

vi.mock("fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("fs")>();
  return {
    ...real,
    // Reversed, not shuffled: a shuffle would make a failure depend on which
    // permutation came up, and a test that fails one run in n is worse than no
    // test. Reversal is the worst case and it is the same worst case every run.
    readdirSync: ((...args: Parameters<typeof real.readdirSync>) => {
      const entries = real.readdirSync(...args);
      return Array.isArray(entries) ? [...entries].reverse() : entries;
    }) as typeof real.readdirSync,
  };
});

const { getGraph } = await import("@/lib/data/loader");
const graph = getGraph();

/** Ids in the order the loader emitted them, restricted to one domain. */
function idsInDomain(domain: string): string[] {
  return graph.claims.filter((c) => c.domain === domain).map((c) => c.id);
}

/** The domains present, in the order their claims first appear. */
const domains = [...new Set(graph.claims.map((c) => c.domain))];

describe("loader listing order", () => {
  it("has more than one claim in at least one domain, or it proves nothing", () => {
    expect(domains.length).toBeGreaterThan(0);
    expect(Math.max(...domains.map((d) => idsInDomain(d).length))).toBeGreaterThan(1);
  });

  it.each(domains)("loads %s's claims in sorted filename order", (domain) => {
    const ids = idsInDomain(domain);
    // Files are `<id>.md`, so sorting the filenames is sorting the ids with the
    // extension attached — `S1.md` before `S10.md` before `S2.md`. Comparing
    // against that rather than against sorted ids keeps the assertion tied to
    // what the loader actually sorts.
    const expected = [...ids].sort((a, b) => (`${a}.md` < `${b}.md` ? -1 : 1));
    expect(ids).toEqual(expected);
  });

  it("loads forecasts in sorted filename order", () => {
    const ids = graph.forecasts.map((f) => f.id);
    // Forecast files are `<id>.yaml` and every domain's forecasts load as one
    // block, so the global array is sorted within each block but not across
    // them. Assert per block, keyed by the claim each forecast attaches to.
    const domainOf = new Map(graph.claims.map((c) => [c.id, c.domain]));
    const byDomain = new Map<string, string[]>();
    for (const f of graph.forecasts) {
      const d = domainOf.get(f.attachedToClaimId) ?? "";
      byDomain.set(d, [...(byDomain.get(d) ?? []), f.id]);
    }
    expect(ids.length).toBeGreaterThan(0);
    for (const [, block] of byDomain) {
      const expected = [...block].sort((a, b) => (`${a}.yaml` < `${b}.yaml` ? -1 : 1));
      expect(block).toEqual(expected);
    }
  });

  it("still loads every claim, edge and forecast under the reversed listing", () => {
    // Guards the mock itself: if `importOriginal` ever stopped returning a real
    // `fs`, the assertions above would pass over an empty graph.
    expect(graph.claims.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.forecasts.length).toBeGreaterThan(0);
  });
});
