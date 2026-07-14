import { describe, it, expect } from "vitest";
import matter from "gray-matter";
import {
  ClaimPayload,
  ProposalEnvelope,
  inferDomainPrefix,
  mintClaimId,
  buildClaim,
  type TokenIdentity,
} from "@/lib/proposals";
import { claimToMarkdown, claimPath } from "@/lib/data/serialize";
import { Claim } from "@/lib/types";

const identity: TokenIdentity = {
  tokenId: "bot-1",
  operator: "ostin-pil",
  agent: "claude-opus-4-8",
  agentId: "a1b2c3d4e5f60718",
};

const validPayload = {
  domain: "inequality",
  kind: "mechanism" as const,
  title: "A mechanism",
  statement: "Something causes something.",
  confidence: 0.6,
  sources: [
    { label: "A real paper", url: "https://example.org/paper", kind: "paper" as const },
  ],
};

// The real id sets from data/, so the tests pin the actual convention rather
// than an idealised one.
const DB_IDS = ["S1", "S2", "S3", "M1", "M2", "M3", "M4", "M5", "L1", "L2", "L3", "L4"];
const INEQ_IDS = ["IS1", "IS2", "IM1", "IM2", "IM3", "IL1", "IL2", "IL3"];
const EC_IDS = ["ECS1", "ECM1", "ECL1"];
const ALL_IDS = [...DB_IDS, ...INEQ_IDS, ...EC_IDS];

describe("ClaimPayload", () => {
  it("accepts a well-formed proposal", () => {
    expect(ClaimPayload.safeParse(validPayload).success).toBe(true);
  });

  // A claim with no citation is the one thing this project exists not to
  // publish, so it is refused at the door rather than left to a reviewer.
  it("rejects a claim with no sources", () => {
    const result = ClaimPayload.safeParse({ ...validPayload, sources: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a source whose url is not a url", () => {
    const result = ClaimPayload.safeParse({
      ...validPayload,
      sources: [{ label: "Fake", url: "not-a-url" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside 0..1", () => {
    expect(ClaimPayload.safeParse({ ...validPayload, confidence: 1.5 }).success).toBe(false);
  });

  // The caller supplies content, never identity or ids. If the schema silently
  // accepted these, a caller could assert its own provenance.
  it("does not accept a caller-supplied id, attribution, or timestamp", () => {
    const parsed = ClaimPayload.parse({
      ...validPayload,
      id: "IM99",
      authoredBy: { agent: "i-am-whoever-i-say", generatedAt: "2020-01-01" },
      createdAt: "1999-01-01",
    });
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("authoredBy");
    expect(parsed).not.toHaveProperty("createdAt");
  });
});

describe("ProposalEnvelope", () => {
  it("requires a rationale — it becomes the PR body", () => {
    expect(
      ProposalEnvelope.safeParse({ kind: "claim", payload: {}, rationale: "" }).success,
    ).toBe(false);
  });

  it("knows the four proposal kinds", () => {
    for (const kind of ["claim", "edge", "prediction", "dossier_position"]) {
      expect(
        ProposalEnvelope.safeParse({ kind, payload: {}, rationale: "because" }).success,
      ).toBe(true);
    }
    expect(
      ProposalEnvelope.safeParse({ kind: "nonsense", payload: {}, rationale: "x" }).success,
    ).toBe(false);
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

describe("mintClaimId", () => {
  it("continues each domain's sequence", () => {
    expect(mintClaimId("", "symptom", ALL_IDS)).toBe("S4");
    expect(mintClaimId("", "mechanism", ALL_IDS)).toBe("M6");
    expect(mintClaimId("I", "leverage_point", ALL_IDS)).toBe("IL4");
    expect(mintClaimId("EC", "symptom", ALL_IDS)).toBe("ECS2");
  });

  it("starts at 1 in an empty sequence", () => {
    expect(mintClaimId("I", "symptom", [])).toBe("IS1");
  });

  // Ids are never reused: a deleted S3 must not come back and collide with the
  // S3 a consumer already cached.
  it("takes the max, not the count — a gap does not get refilled", () => {
    expect(mintClaimId("", "symptom", ["S1", "S3"])).toBe("S4");
  });

  it("does not let one domain's prefix bleed into another's sequence", () => {
    // "IS1"/"IS2" must not push the bare "S" sequence forward.
    expect(mintClaimId("", "symptom", ["IS1", "IS2", "IS9"])).toBe("S1");
  });
});

describe("buildClaim", () => {
  const base = {
    payload: ClaimPayload.parse(validPayload),
    identity,
    existingIdsInDomain: INEQ_IDS,
    allExistingIds: ALL_IDS,
    now: "2026-07-14T12:00:00.000Z",
  };

  it("mints the id, and stamps the timestamp and attribution", () => {
    const result = buildClaim(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.claim.id).toBe("IM4");
    expect(result.claim.createdAt).toBe("2026-07-14T12:00:00.000Z");
    expect(result.claim.authoredBy.operator).toBe("ostin-pil");
    expect(result.claim.authoredBy.agentId).toBe("a1b2c3d4e5f60718");
    expect(result.claim.authoredBy.agent).toBe("claude-opus-4-8");
    expect(result.claim.authoredBy.generatedAt).toBe("2026-07-14T12:00:00.000Z");
  });

  it("carries the caller's content through untouched", () => {
    const result = buildClaim(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claim.title).toBe(validPayload.title);
    expect(result.claim.statement).toBe(validPayload.statement);
    expect(result.claim.confidence).toBe(0.6);
    expect(result.claim.sources).toHaveLength(1);
  });

  it("refuses a domain it cannot mint an id for, rather than inventing a prefix", () => {
    const result = buildClaim({ ...base, existingIdsInDomain: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no existing claims");
    expect(result.error).toContain("will not invent one");
  });

  it("produces a claim that the canonical Claim schema accepts", () => {
    const result = buildClaim(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Claim.safeParse(result.claim).success).toBe(true);
  });
});

describe("claimToMarkdown", () => {
  const built = buildClaim({
    payload: ClaimPayload.parse(validPayload),
    identity,
    existingIdsInDomain: INEQ_IDS,
    allExistingIds: ALL_IDS,
    now: "2026-07-14T12:00:00.000Z",
  });

  // The property that actually matters: what the write path commits must be
  // what the loader can read back. A file that does not parse is a broken PR.
  it("round-trips through the loader's own parse (gray-matter + Zod)", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const markdown = claimToMarkdown(built.claim);
    const { data, content } = matter(markdown);
    const reparsed = Claim.safeParse({ ...data, statement: content.trim() });

    expect(reparsed.success).toBe(true);
    if (!reparsed.success) return;
    expect(reparsed.data).toEqual(built.claim);
  });

  it("puts the statement in the body, not the frontmatter", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const markdown = claimToMarkdown(built.claim);
    const { data, content } = matter(markdown);
    expect(data).not.toHaveProperty("statement");
    expect(content.trim()).toBe(validPayload.statement);
  });

  it("survives a title with YAML metacharacters", () => {
    const nasty = buildClaim({
      payload: ClaimPayload.parse({
        ...validPayload,
        title: 'Inequality: "rising" — or is it? #hashtag',
      }),
      identity,
      existingIdsInDomain: INEQ_IDS,
      allExistingIds: ALL_IDS,
      now: "2026-07-14T12:00:00.000Z",
    });
    expect(nasty.ok).toBe(true);
    if (!nasty.ok) return;

    const { data } = matter(claimToMarkdown(nasty.claim));
    expect(data.title).toBe('Inequality: "rising" — or is it? #hashtag');
  });
});

describe("claimPath", () => {
  it("targets the layout in CLAUDE.md", () => {
    expect(claimPath({ id: "IM4", domain: "inequality" })).toBe(
      "data/inequality/claims/IM4.md",
    );
  });
});
