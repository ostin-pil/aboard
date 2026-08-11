import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { domainPrefix, mintClaimId, type MintableClaim } from "./mint-id";

const claims = (...pairs: [string, string | undefined][]): MintableClaim[] =>
  pairs.map(([id, domain]) => ({ id, domain }));

describe("domainPrefix", () => {
  it("reads the prefix off the domain's existing claims", () => {
    const corpus = claims(
      ["IS1", "inequality"],
      ["IM1", "inequality"],
      ["S1", "democratic_backsliding"]
    );
    expect(domainPrefix("inequality", corpus)).toBe("I");
  });

  // The case no name-derived rule gets right: the founding domain's prefix is
  // the empty string, and only its own claims say so.
  it("returns the empty prefix for a domain that uses bare ids", () => {
    const corpus = claims(["S1", "democratic_backsliding"], ["M1", "democratic_backsliding"]);
    expect(domainPrefix("democratic_backsliding", corpus)).toBe("");
  });

  it("falls back to the initials of a domain with no claims yet", () => {
    expect(domainPrefix("climate", [])).toBe("C");
    expect(domainPrefix("food_systems", [])).toBe("FS");
    expect(domainPrefix("epistack_cases", [])).toBe("EC");
  });

  it("ignores ids that are not in the id shape", () => {
    const corpus = claims(["not-an-id", "inequality"], ["IS1", "inequality"]);
    expect(domainPrefix("inequality", corpus)).toBe("I");
  });

  it("takes the more common prefix when a domain holds two", () => {
    const corpus = claims(
      ["IS1", "inequality"],
      ["IM1", "inequality"],
      ["S9", "inequality"]
    );
    expect(domainPrefix("inequality", corpus)).toBe("I");
  });

  it("returns the empty prefix for a claim with no domain", () => {
    expect(domainPrefix(undefined, claims(["IS1", "inequality"]))).toBe("");
  });
});

describe("mintClaimId", () => {
  const corpus = claims(
    ["S1", "democratic_backsliding"],
    ["S2", "democratic_backsliding"],
    ["M1", "democratic_backsliding"],
    ["IS1", "inequality"],
    ["IS2", "inequality"],
    ["ECM1", "epistack_cases"]
  );

  it("mints into the target domain's namespace, not the bare one", () => {
    expect(mintClaimId("symptom", "inequality", corpus)).toBe("IS3");
    expect(mintClaimId("mechanism", "inequality", corpus)).toBe("IM1");
    expect(mintClaimId("leverage", "epistack_cases", corpus)).toBe("ECL1");
  });

  it("still mints bare ids for the domain that uses them", () => {
    expect(mintClaimId("symptom", "democratic_backsliding", corpus)).toBe("S3");
    expect(mintClaimId("mechanism", "democratic_backsliding", corpus)).toBe("M2");
  });

  // The regression itself: before this, every one of these was S3.
  it("gives three domains three different ids for the same kind", () => {
    const minted = [
      mintClaimId("symptom", "democratic_backsliding", corpus),
      mintClaimId("symptom", "inequality", corpus),
      mintClaimId("symptom", "epistack_cases", corpus),
    ];
    expect(new Set(minted).size).toBe(3);
  });

  it("skips an id another domain already holds", () => {
    // `inequality` has no claims here, so the prefix falls back to "I" and the
    // first candidate is IS1 — which another domain is already using.
    const crossNamespace = claims(["IS1", "somewhere_else"]);
    expect(mintClaimId("symptom", "inequality", crossNamespace)).toBe("IS2");
  });

  it("mints the first id of a kind in an empty graph", () => {
    expect(mintClaimId("leverage", "climate", [])).toBe("CL1");
    expect(mintClaimId("symptom", undefined, [])).toBe("S1");
  });
});

/**
 * The corpus is the specification here. If a future domain adopts a convention
 * this function cannot reproduce, the editor would mint into a namespace the
 * data does not use, and nothing else in the repo would notice.
 */
describe("every domain in data/ mints into its own namespace", () => {
  const dataDir = join(process.cwd(), "data");
  const domains = readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const corpus: MintableClaim[] = domains.flatMap((domain) => {
    let files: string[] = [];
    try {
      files = readdirSync(join(dataDir, domain, "claims"));
    } catch {
      return [];
    }
    return files
      .filter((file) => file.endsWith(".md"))
      .map((file) => ({ id: file.replace(/\.md$/, ""), domain }));
  });

  it("finds the live domains", () => {
    expect(domains.length).toBeGreaterThan(0);
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(domains)("%s", (domain) => {
    const own = corpus.filter((claim) => claim.domain === domain);
    if (own.length === 0) return; // a domain with no claims has no convention yet
    const prefix = domainPrefix(domain, corpus);
    // Every existing id in the domain starts with the prefix the mint would use.
    for (const claim of own) {
      expect(claim.id.startsWith(prefix)).toBe(true);
    }
    // And a fresh mint lands in that namespace without colliding with anything.
    for (const kind of ["symptom", "mechanism", "leverage"] as const) {
      const minted = mintClaimId(kind, domain, corpus);
      expect(minted.startsWith(prefix)).toBe(true);
      expect(corpus.some((claim) => claim.id === minted)).toBe(false);
    }
  });
});
