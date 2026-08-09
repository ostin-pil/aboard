import { describe, it, expect } from "vitest";
import matter from "gray-matter";
import YAML from "yaml";
import {
  ClaimPayload,
  EdgePayload,
  PredictionPayload,
  DossierPayload,
  ProposalEnvelope,
  inferDomainPrefix,
  nextSequentialId,
  mintClaimId,
  buildClaim,
  buildEdge,
  buildPrediction,
  buildDossier,
  type TokenIdentity,
  HTTP_ENTRY_POINT,
  LIMITS,
} from "@/lib/proposals";
import { claimPrBody } from "@/lib/pr-body";
import {
  claimToMarkdown,
  claimPath,
  appendEdgeToYaml,
  appendPredictionToForecast,
  dossierToYaml,
  dossierPath,
} from "@/lib/data/serialize";
import { Claim, Edge, Forecast, Dossier } from "@/lib/types";

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

  it("rejects a source whose url carries an unsafe scheme", () => {
    const result = ClaimPayload.safeParse({
      ...validPayload,
      sources: [{ label: "Not a source", url: "javascript:alert(1)" }],
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Every one of these values is interpolated into a PR body, and GitHub rejects
 * a body over 65,536 characters with a 422 the agent sees as an opaque
 * `github_failed`. Unbounded strings meant the failure appeared at the very
 * end of a proposal, after the branch and the commit had already been made.
 */
describe("payload bounds", () => {
  const over = (n: number) => "x".repeat(n + 1);

  it("bounds the statement, title and domain", () => {
    expect(
      ClaimPayload.safeParse({ ...validPayload, statement: over(LIMITS.prose) }).success,
    ).toBe(false);
    expect(ClaimPayload.safeParse({ ...validPayload, title: over(LIMITS.line) }).success).toBe(
      false,
    );
    expect(ClaimPayload.safeParse({ ...validPayload, domain: over(LIMITS.id) }).success).toBe(
      false,
    );
  });

  it("accepts a value exactly at the bound", () => {
    const at = ClaimPayload.safeParse({
      ...validPayload,
      statement: "x".repeat(LIMITS.prose),
    });
    expect(at.success).toBe(true);
  });

  it("bounds the number of sources", () => {
    const source = { label: "V-Dem", url: "https://v-dem.net/" };
    const many = Array.from({ length: LIMITS.list + 1 }, () => source);
    expect(ClaimPayload.safeParse({ ...validPayload, sources: many }).success).toBe(false);
  });

  it("bounds fields inside a source", () => {
    const result = ClaimPayload.safeParse({
      ...validPayload,
      sources: [{ label: over(LIMITS.line), url: "https://v-dem.net/" }],
    });
    expect(result.success).toBe(false);
  });

  it("bounds the envelope rationale", () => {
    const envelope = {
      kind: "claim",
      payload: validPayload,
      rationale: over(LIMITS.prose),
    };
    expect(ProposalEnvelope.safeParse(envelope).success).toBe(false);
  });

  /**
   * The bound that actually matters: the worst legal proposal must still render
   * a PR body GitHub will accept. If a limit is ever raised, this is the test
   * that should stop it.
   */
  it("keeps the largest legal claim proposal inside GitHub's PR body limit", () => {
    const source = {
      label: "x".repeat(LIMITS.line),
      url: `https://example.org/${"y".repeat(LIMITS.url - 21)}`,
    };
    const body = claimPrBody(
      {
        id: "S1",
        kind: "symptom",
        title: "x".repeat(LIMITS.line),
        statement: "x".repeat(LIMITS.prose),
        domain: "x".repeat(LIMITS.id),
        confidence: 0.5,
        sources: Array.from({ length: LIMITS.list }, () => source),
        dataPoints: [],
        analyses: [],
        authoredBy: { agent: "a", generatedAt: "2026-08-08T00:00:00Z" },
        createdAt: "2026-08-08T00:00:00Z",
      },
      "x".repeat(LIMITS.prose),
      identity,
    );
    expect(body.length).toBeLessThan(65_536);
  });
});

describe("ProposalEnvelope", () => {
  it("requires a rationale — it becomes the PR body", () => {
    expect(
      ProposalEnvelope.safeParse({ kind: "claim", payload: {}, rationale: "" }).success,
    ).toBe(false);
  });

  it("knows the four proposal kinds", () => {
    for (const kind of ["claim", "edge", "prediction", "dossier"]) {
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

  it("names the door the proposal came through", () => {
    const result = buildClaim({ ...base, via: "MCP propose_claim" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claim.authoredBy.promptTitle).toBe("Agent proposal via MCP propose_claim");
  });

  it("falls back to the HTTP endpoint when no door is named", () => {
    const result = buildClaim(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claim.authoredBy.promptTitle).toBe(`Agent proposal via ${HTTP_ENTRY_POINT}`);
  });

  it("takes the door from the caller's shell, never from the payload", () => {
    // A payload claiming its own provenance must not reach the attribution:
    // the same rule that keeps `operator` server-side.
    const spoofed = { ...validPayload, via: "MCP propose_claim", promptTitle: "trust me" };
    const result = buildClaim({ ...base, payload: ClaimPayload.parse(spoofed) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claim.authoredBy.promptTitle).toBe(`Agent proposal via ${HTTP_ENTRY_POINT}`);
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

// --- edges -----------------------------------------------------------------

// The real id sets from data/, so the tests pin the actual conventions:
// intra-domain edges are <domainPrefix>E<n>, cross-domain edges are CE<n>.
const CLAIM_DOMAINS = new Map<string, string>([
  ["S1", "democratic_backsliding"],
  ["M1", "democratic_backsliding"],
  ["IS1", "inequality"],
  ["IM1", "inequality"],
  ["IL1", "inequality"],
  ["ECS1", "epistack_cases"],
  ["ECM1", "epistack_cases"],
]);
const CLAIM_IDS_BY_DOMAIN = new Map<string, readonly string[]>([
  ["democratic_backsliding", ["S1", "M1", "L1"]],
  ["inequality", ["IS1", "IM1", "IL1"]],
  ["epistack_cases", ["ECS1", "ECM1", "ECL1"]],
]);
const ALL_EDGE_IDS = ["E1", "E12", "IE1", "IE7", "ECE1", "ECE2", "CE1", "CE3"];

const validEdge = {
  from: "IM1",
  to: "IS1",
  kind: "causes" as const,
  strength: 0.6,
  sources: [],
};
// The rationale rides the envelope, not the payload (like a claim's); buildEdge
// takes it separately and stores it on the edge.
const EDGE_RATIONALE = "r > g compounds wealth stocks faster than the wage bill grows.";

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
});

describe("EdgePayload", () => {
  it("accepts a well-formed edge", () => {
    expect(EdgePayload.safeParse(validEdge).success).toBe(true);
  });

  it("defaults sources to [] (a rationale-only edge, like the seed edges)", () => {
    const parsed = EdgePayload.parse({ ...validEdge, sources: undefined });
    expect(parsed.sources).toEqual([]);
  });

  it("does not carry a rationale — that rides the envelope, not the payload", () => {
    const parsed = EdgePayload.parse({ ...validEdge, rationale: "ignored" });
    expect(parsed).not.toHaveProperty("rationale");
  });

  it("does not accept a caller-supplied edge id", () => {
    const parsed = EdgePayload.parse({ ...validEdge, id: "IE99" });
    expect(parsed).not.toHaveProperty("id");
  });
});

describe("buildEdge", () => {
  const base = {
    rationale: EDGE_RATIONALE,
    claimDomains: CLAIM_DOMAINS,
    claimIdsByDomain: CLAIM_IDS_BY_DOMAIN,
    allEdgeIds: ALL_EDGE_IDS,
  };

  it("mints an intra-domain id on the domain's prefix and targets its edges.yaml", () => {
    const result = buildEdge({ payload: EdgePayload.parse(validEdge), ...base });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.crossDomain).toBe(false);
    expect(result.edge.id).toBe("IE8");
    expect(result.path).toBe("data/inequality/edges.yaml");
  });

  it("routes an edge that spans domains to cross_domain_edges.yaml with a CE id", () => {
    const result = buildEdge({
      payload: EdgePayload.parse({ ...validEdge, from: "IM1", to: "S1" }),
      ...base,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.crossDomain).toBe(true);
    expect(result.edge.id).toBe("CE4");
    expect(result.path).toBe("data/cross_domain_edges.yaml");
  });

  it("handles the empty-prefix domain (democratic_backsliding → E<n>)", () => {
    const result = buildEdge({
      payload: EdgePayload.parse({ ...validEdge, from: "M1", to: "S1" }),
      ...base,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edge.id).toBe("E13");
    expect(result.path).toBe("data/democratic_backsliding/edges.yaml");
  });

  it("refuses a self-loop", () => {
    const result = buildEdge({
      payload: EdgePayload.parse({ ...validEdge, from: "IM1", to: "IM1" }),
      ...base,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("itself");
  });

  it("refuses an unknown source or target claim", () => {
    const bad = buildEdge({ payload: EdgePayload.parse({ ...validEdge, from: "NOPE" }), ...base });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error).toContain("source");

    const bad2 = buildEdge({ payload: EdgePayload.parse({ ...validEdge, to: "GONE" }), ...base });
    expect(bad2.ok).toBe(false);
    if (bad2.ok) return;
    expect(bad2.error).toContain("target");
  });

  it("carries the payload's relation, strength, rationale, and sources through", () => {
    const result = buildEdge({
      payload: EdgePayload.parse({
        ...validEdge,
        kind: "reduces",
        strength: 0.4,
        sources: [{ label: "P", url: "https://example.org/p", kind: "paper" }],
      }),
      ...base,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edge.kind).toBe("reduces");
    expect(result.edge.strength).toBe(0.4);
    expect(result.edge.sources).toHaveLength(1);
    // the rationale comes from the envelope arg, not the payload
    expect(result.edge.rationale).toBe(EDGE_RATIONALE);
    expect(Edge.safeParse(result.edge).success).toBe(true);
  });

  // Guards the seam the Worker actually runs: the envelope carries the
  // rationale, the payload does not, and the built edge ends up with it. An
  // earlier version required rationale *in* the payload, which the client never
  // sends — every edge proposal 422'd until a live test caught it.
  it("mirrors the Worker flow — envelope rationale, payload without it", () => {
    const envelope = ProposalEnvelope.parse({
      kind: "edge",
      rationale: "why this relation holds",
      payload: { from: "IM1", to: "IS1", kind: "causes", strength: 0.6 },
    });
    const payload = EdgePayload.parse(envelope.payload);
    const result = buildEdge({ payload, ...base, rationale: envelope.rationale });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edge.rationale).toBe("why this relation holds");
  });
});

describe("appendEdgeToYaml", () => {
  const built = buildEdge({
    payload: EdgePayload.parse(validEdge),
    rationale: EDGE_RATIONALE,
    claimDomains: CLAIM_DOMAINS,
    claimIdsByDomain: CLAIM_IDS_BY_DOMAIN,
    allEdgeIds: ALL_EDGE_IDS,
  });

  const existing = [
    "- id: IE1",
    "  fromId: IM1",
    "  toId: IS1",
    "  kind: causes",
    "  strength: 0.7",
    "  rationale: An existing edge.",
    "",
  ].join("\n");

  it("appends to an existing list, preserving what was there and adding the new edge", () => {
    if (!built.ok) throw new Error("fixture");
    const merged = appendEdgeToYaml(existing, built.edge);
    const list = YAML.parse(merged);

    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(2);
    // the original edge is untouched
    expect(list[0].id).toBe("IE1");
    // the appended edge parses under the canonical Edge schema
    expect(Edge.safeParse(list[1]).success).toBe(true);
    expect(list[1].id).toBe("IE8");
  });

  it("starts a fresh list from an empty or `[]` file (a domain's first edge)", () => {
    if (!built.ok) throw new Error("fixture");
    for (const empty of ["", "   \n", "[]"]) {
      const list = YAML.parse(appendEdgeToYaml(empty, built.edge));
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("IE8");
    }
  });

  it("omits an empty sources line for a rationale-only edge", () => {
    if (!built.ok) throw new Error("fixture");
    const merged = appendEdgeToYaml("", built.edge);
    expect(merged).not.toContain("sources");
  });

  it("keeps sources when the edge has them", () => {
    const withSrc = buildEdge({
      payload: EdgePayload.parse({
        ...validEdge,
        sources: [{ label: "P", url: "https://example.org/p", kind: "paper" }],
      }),
      rationale: EDGE_RATIONALE,
      claimDomains: CLAIM_DOMAINS,
      claimIdsByDomain: CLAIM_IDS_BY_DOMAIN,
      allEdgeIds: ALL_EDGE_IDS,
    });
    if (!withSrc.ok) throw new Error("fixture");
    const list = YAML.parse(appendEdgeToYaml("", withSrc.edge));
    expect(list[0].sources[0].url).toBe("https://example.org/p");
  });
});

// --- predictions -----------------------------------------------------------

const PREDICTION_REASONING =
  "DSA pressure raises the odds, but reproducibility-grade disclosure is a big step beyond current practice.";

describe("PredictionPayload", () => {
  it("accepts forecastId + probability, defaults dataAnchors", () => {
    const parsed = PredictionPayload.parse({ forecastId: "F4", probability: 0.4 });
    expect(parsed.dataAnchors).toEqual([]);
  });

  it("does not carry reasoning — that rides the envelope", () => {
    const parsed = PredictionPayload.parse({ forecastId: "F4", probability: 0.4, reasoning: "x" });
    expect(parsed).not.toHaveProperty("reasoning");
  });

  it("rejects a probability outside 0..1", () => {
    expect(PredictionPayload.safeParse({ forecastId: "F4", probability: 2 }).success).toBe(false);
  });
});

describe("buildPrediction", () => {
  const base = {
    reasoning: PREDICTION_REASONING,
    identity,
    knownForecastIds: new Set(["F4", "IF1"]),
    now: "2026-07-18T12:00:00.000Z",
  };

  it("stamps the agent and timestamp, and takes reasoning from the envelope", () => {
    const result = buildPrediction({
      payload: PredictionPayload.parse({ forecastId: "F4", probability: 0.4 }),
      ...base,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.forecastId).toBe("F4");
    expect(result.prediction.probability).toBe(0.4);
    expect(result.prediction.reasoning).toBe(PREDICTION_REASONING);
    expect(result.prediction.createdAt).toBe("2026-07-18T12:00:00.000Z");
    expect(result.prediction.agent.operator).toBe("ostin-pil");
    expect(result.prediction.agent.agentId).toBe("a1b2c3d4e5f60718");
  });

  it("refuses a prediction on a forecast that does not exist", () => {
    const result = buildPrediction({
      payload: PredictionPayload.parse({ forecastId: "F999", probability: 0.4 }),
      ...base,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unknown forecast "F999"');
  });
});

describe("appendPredictionToForecast", () => {
  const forecastText = [
    "id: F4",
    "attachedToClaimId: M4",
    "question: Will a platform publish ranking parameters by 2027?",
    "resolutionDate: 2027-12-31",
    "resolutionCriteria: A first-party reproducibility-grade publication.",
    "predictions:",
    "  - agent:",
    "      agent: claude-opus-4-7",
    "      generatedAt: 2026-05-08T12:00:00Z",
    "    probability: 0.35",
    "    reasoning: An existing prediction.",
    "    createdAt: 2026-05-08T12:30:00Z",
    "",
  ].join("\n");

  const built = buildPrediction({
    payload: PredictionPayload.parse({ forecastId: "F4", probability: 0.4 }),
    reasoning: PREDICTION_REASONING,
    identity,
    knownForecastIds: new Set(["F4"]),
    now: "2026-07-18T12:00:00.000Z",
  });

  it("appends into predictions[] and the whole forecast still parses under the schema", () => {
    if (!built.ok) throw new Error("fixture");
    const merged = appendPredictionToForecast(forecastText, built.prediction);
    const parsed = Forecast.safeParse(YAML.parse(merged));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.predictions).toHaveLength(2);
    // existing prediction untouched
    expect(parsed.data.predictions[0].probability).toBe(0.35);
    // appended prediction present with the server-stamped provenance
    expect(parsed.data.predictions[1].probability).toBe(0.4);
    expect(parsed.data.predictions[1].agent.operator).toBe("ostin-pil");
    expect(parsed.data.predictions[1].reasoning).toBe(PREDICTION_REASONING);
  });

  it("preserves the existing forecast body (diff is only the appended block)", () => {
    if (!built.ok) throw new Error("fixture");
    const merged = appendPredictionToForecast(forecastText, built.prediction);
    // everything up to the original last line is unchanged, byte for byte
    expect(merged.startsWith(forecastText.trimEnd())).toBe(true);
  });

  // The real forecast files fold their long strings across lines. Re-serializing
  // with lineWidth:0 would unfold every one and reformat the whole file; this
  // fixture has genuinely folded content and asserts none of it changes.
  it("preserves existing folded long strings, not just short ones", () => {
    if (!built.ok) throw new Error("fixture");
    const existingFolded = YAML.stringify({
      id: "F4",
      attachedToClaimId: "M4",
      question: `Will a platform ${"publish detailed ranking parameters ".repeat(4)}by 2027?`,
      resolutionDate: "2027-12-31",
      resolutionCriteria: `A first-party ${"reproducibility-grade publication ".repeat(4)}for one surface.`,
      predictions: [
        {
          agent: { agent: "seed", generatedAt: "2026-05-08T12:00:00Z" },
          probability: 0.35,
          reasoning: `Regulatory pressure ${"raises the baseline but the bar is high ".repeat(4)}on balance.`,
          baseRates: [],
          dataAnchors: [],
          createdAt: "2026-05-08T12:30:00Z",
        },
      ],
    });
    expect(existingFolded).toMatch(/\n {2}\S/); // sanity: it really did fold across lines

    const merged = appendPredictionToForecast(existingFolded, built.prediction);
    const out = new Set(merged.split("\n"));
    for (const line of existingFolded.split("\n")) {
      if (line.trim()) expect(out.has(line)).toBe(true); // every original line survives
    }
  });
});

// --- dossiers --------------------------------------------------------------

const argument = (thesis: string) => ({
  thesis,
  steelmannedSummary: `A steel-manned case: ${thesis}`,
  keySources: [{ label: "A source", url: "https://example.org/s", kind: "paper" as const }],
});

const validDossier = {
  claimId: "ECM1",
  pro: argument("The mechanism is real."),
  con: argument("The mechanism is not meaningful."),
  cruxes: [{ statement: "Does a dose-response survive adjustment?", impactScore: 0.85, uncertainty: 0.7 }],
};

describe("DossierPayload", () => {
  it("accepts a complete two-sided dossier", () => {
    expect(DossierPayload.safeParse(validDossier).success).toBe(true);
  });

  it("rejects a one-sided dossier — both sides are required", () => {
    const { con: _con, ...oneSided } = validDossier;
    expect(DossierPayload.safeParse(oneSided).success).toBe(false);
  });

  it("requires each side to cite at least one source", () => {
    const noSources = { ...validDossier, pro: { ...validDossier.pro, keySources: [] } };
    expect(DossierPayload.safeParse(noSources).success).toBe(false);
  });

  it("defaults cruxes to []", () => {
    const { cruxes: _c, ...noCruxes } = validDossier;
    expect(DossierPayload.parse(noCruxes).cruxes).toEqual([]);
  });
});

describe("buildDossier", () => {
  const base = { identity, now: "2026-07-18T12:00:00.000Z" };

  it("stamps authoredBy on BOTH sides and builds a valid dossier", () => {
    const result = buildDossier({
      payload: DossierPayload.parse(validDossier),
      claimExists: true,
      dossierExists: false,
      ...base,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dossier.attachedToClaimId).toBe("ECM1");
    expect(result.dossier.pro.authoredBy.operator).toBe("ostin-pil");
    expect(result.dossier.con.authoredBy.agentId).toBe("a1b2c3d4e5f60718");
    expect(result.dossier.cruxes).toHaveLength(1);
    expect(Dossier.safeParse(result.dossier).success).toBe(true);
  });

  it("refuses a claim that does not exist", () => {
    const result = buildDossier({
      payload: DossierPayload.parse(validDossier),
      claimExists: false,
      dossierExists: false,
      ...base,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Unknown claim");
  });

  // The whole point of the reframe: never clobber a curated dossier.
  it("refuses to overwrite a claim that already has a dossier", () => {
    const result = buildDossier({
      payload: DossierPayload.parse(validDossier),
      claimExists: true,
      dossierExists: true,
      ...base,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("already has a dossier");
    expect(result.error).toContain("will not overwrite");
  });
});

describe("dossierToYaml", () => {
  const built = buildDossier({
    payload: DossierPayload.parse(validDossier),
    identity,
    claimExists: true,
    dossierExists: false,
    now: "2026-07-18T12:00:00.000Z",
  });

  it("round-trips: serialize → parse → validates under the Dossier schema", () => {
    if (!built.ok) throw new Error("fixture");
    const yaml = dossierToYaml(built.dossier);
    const reparsed = Dossier.safeParse(YAML.parse(yaml));
    expect(reparsed.success).toBe(true);
    if (!reparsed.success) return;
    expect(reparsed.data).toEqual(built.dossier);
  });
});

describe("dossierPath", () => {
  it("targets the layout in CLAUDE.md", () => {
    expect(dossierPath("ECM1", "epistack_cases")).toBe(
      "data/epistack_cases/dossiers/ECM1.yaml",
    );
  });
});
