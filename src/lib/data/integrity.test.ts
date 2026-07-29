import { describe, it, expect } from "vitest";
import {
  integrityErrors,
  assertIntegrity,
  type SourceRef,
} from "@/lib/data/integrity";
import type {
  Claim,
  Edge,
  Forecast,
  Dossier,
  Analysis,
  ClaimGraph,
  Argument,
} from "@/lib/types";

/**
 * Fixtures. The integrity layer only reads ids, domains and reference fields,
 * but the graph is typed, so the factories fill the rest with plausible values.
 */

const agent = { agent: "claude-opus-4-8", generatedAt: "2026-07-14T00:00:00Z" };

const claim = (over: Partial<Claim> & Pick<Claim, "id">): Claim => ({
  kind: "symptom",
  title: `Claim ${over.id}`,
  statement: "A statement.",
  domain: "democratic_backsliding",
  confidence: 0.7,
  sources: [],
  dataPoints: [],
  analyses: [],
  authoredBy: agent,
  createdAt: "2026-07-14",
  ...over,
});

const edge = (over: Partial<Edge> & Pick<Edge, "id" | "fromId" | "toId">): Edge => ({
  kind: "causes",
  strength: 0.5,
  rationale: "A stated reason.",
  sources: [],
  ...over,
});

const forecast = (
  over: Partial<Forecast> & Pick<Forecast, "id" | "attachedToClaimId">,
): Forecast => ({
  question: "Will it?",
  resolutionDate: "2027-01-01",
  resolutionCriteria: "Resolves YES if it does.",
  predictions: [],
  ...over,
});

const argument = (): Argument => ({
  thesis: "Thesis.",
  steelmannedSummary: "Summary.",
  keySources: [],
  authoredBy: agent,
});

const dossier = (attachedToClaimId: string): Dossier => ({
  attachedToClaimId,
  pro: argument(),
  con: argument(),
  cruxes: [],
});

const analysis = (
  over: Partial<Analysis> & Pick<Analysis, "id">,
): Analysis => ({
  domain: "democratic_backsliding",
  kind: "synthesis",
  title: `Analysis ${over.id}`,
  summary: "Summary.",
  dataSources: [],
  producedFinding: "A finding.",
  authoredBy: agent,
  createdAt: "2026-07-14",
  ...over,
});

const emptyGraph = (): ClaimGraph => ({
  claims: [],
  edges: [],
  forecasts: [],
  dossiers: [],
  analyses: [],
});

const DOMAINS = ["democratic_backsliding", "inequality"];

/** A graph with nothing wrong with it: two claims and an edge between them. */
function cleanGraph(): { graph: ClaimGraph; refs: SourceRef[] } {
  const graph: ClaimGraph = {
    ...emptyGraph(),
    claims: [claim({ id: "S1" }), claim({ id: "M1", kind: "mechanism" })],
    edges: [edge({ id: "E1", fromId: "M1", toId: "S1" })],
  };
  const refs: SourceRef[] = [
    { kind: "claim", id: "S1", file: "data/democratic_backsliding/claims/S1.md" },
    { kind: "claim", id: "M1", file: "data/democratic_backsliding/claims/M1.md" },
    { kind: "edge", id: "E1", file: "data/democratic_backsliding/edges.yaml" },
  ];
  return { graph, refs };
}

describe("integrityErrors", () => {
  it("passes a well-formed graph", () => {
    const { graph, refs } = cleanGraph();
    expect(integrityErrors(graph, refs, DOMAINS)).toEqual([]);
  });

  it("catches an edge pointing at a claim that does not exist", () => {
    const { graph, refs } = cleanGraph();
    graph.edges.push(edge({ id: "E2", fromId: "S1", toId: "GHOST" }));
    refs.push({
      kind: "edge",
      id: "E2",
      file: "data/democratic_backsliding/edges.yaml",
    });

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("data/democratic_backsliding/edges.yaml");
    expect(errors[0]).toContain('edge "E2"');
    expect(errors[0]).toContain("toId");
    expect(errors[0]).toContain('unknown claim "GHOST"');
  });

  it("distinguishes a dangling fromId from a dangling toId", () => {
    const { graph, refs } = cleanGraph();
    graph.edges.push(edge({ id: "E2", fromId: "GHOST", toId: "S1" }));
    refs.push({ kind: "edge", id: "E2", file: "edges.yaml" });

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("fromId");
    expect(errors[0]).not.toContain("toId");
  });

  it("reports both ends when both are dangling", () => {
    const { graph, refs } = cleanGraph();
    graph.edges.push(edge({ id: "E2", fromId: "NOPE", toId: "GHOST" }));
    refs.push({ kind: "edge", id: "E2", file: "edges.yaml" });

    expect(integrityErrors(graph, refs, DOMAINS)).toHaveLength(2);
  });

  it("catches a forecast attached to an unknown claim", () => {
    const { graph, refs } = cleanGraph();
    graph.forecasts.push(forecast({ id: "F9", attachedToClaimId: "GHOST" }));
    refs.push({
      kind: "forecast",
      id: "F9",
      file: "data/democratic_backsliding/forecasts/F9.yaml",
    });

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("forecasts/F9.yaml");
    expect(errors[0]).toContain('forecast "F9"');
    expect(errors[0]).toContain('unknown claim "GHOST"');
  });

  it("catches a dossier attached to an unknown claim", () => {
    const { graph, refs } = cleanGraph();
    graph.dossiers.push(dossier("GHOST"));
    refs.push({
      kind: "dossier",
      id: "GHOST",
      file: "data/democratic_backsliding/dossiers/GHOST.yaml",
    });

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("dossiers/GHOST.yaml");
    expect(errors[0]).toContain('unknown claim "GHOST"');
  });

  it("catches a claim referencing an analysis that does not exist", () => {
    const { graph, refs } = cleanGraph();
    graph.claims[0].analyses = ["A404"];

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("claims/S1.md");
    expect(errors[0]).toContain('unknown analysis "A404"');
  });

  it("catches an orphaned analysis that no claim references", () => {
    const { graph, refs } = cleanGraph();
    graph.analyses.push(analysis({ id: "A1" }));
    refs.push({
      kind: "analysis",
      id: "A1",
      file: "data/democratic_backsliding/analyses/A1.yaml",
    });

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('analysis "A1" is orphaned');
  });

  it("accepts an analysis that a claim does reference", () => {
    const { graph, refs } = cleanGraph();
    graph.analyses.push(analysis({ id: "A1" }));
    refs.push({ kind: "analysis", id: "A1", file: "analyses/A1.yaml" });
    graph.claims[0].analyses = ["A1"];

    expect(integrityErrors(graph, refs, DOMAINS)).toEqual([]);
  });

  // Claim ids are globally unique across domains (CLAUDE.md). Until now that was
  // convention rather than code, and a collision would have silently shadowed a
  // claim.
  it("catches the same claim id minted in two domains", () => {
    const { graph, refs } = cleanGraph();
    graph.claims.push(claim({ id: "S1", domain: "inequality" }));
    refs.push({ kind: "claim", id: "S1", file: "data/inequality/claims/S1.md" });

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('duplicate claim id "S1"');
    // Both files are named, so the contributor knows which two to reconcile.
    expect(errors[0]).toContain("data/democratic_backsliding/claims/S1.md");
    expect(errors[0]).toContain("data/inequality/claims/S1.md");
  });

  it("catches a claim declaring a domain with no directory behind it", () => {
    const { graph, refs } = cleanGraph();
    graph.claims[0].domain = "not_a_real_domain";

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('declares domain "not_a_real_domain"');
    // The message lists the domains that do exist, so the fix is obvious.
    expect(errors[0]).toContain("democratic_backsliding");
  });

  it("validates an analysis's domain too", () => {
    const { graph, refs } = cleanGraph();
    graph.claims[0].analyses = ["A1"];
    graph.analyses.push(analysis({ id: "A1", domain: "made_up" }));
    refs.push({ kind: "analysis", id: "A1", file: "analyses/A1.yaml" });

    const errors = integrityErrors(graph, refs, DOMAINS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('analysis "A1" declares domain "made_up"');
  });

  // The whole point of collecting rather than throwing on the first violation:
  // a contributor fixing bad data sees the full list in one run.
  it("reports every violation at once, not just the first", () => {
    const { graph, refs } = cleanGraph();
    graph.edges.push(edge({ id: "E2", fromId: "S1", toId: "GHOST" }));
    refs.push({ kind: "edge", id: "E2", file: "edges.yaml" });
    graph.forecasts.push(forecast({ id: "F9", attachedToClaimId: "ALSO_GONE" }));
    refs.push({ kind: "forecast", id: "F9", file: "forecasts/F9.yaml" });
    graph.claims[0].domain = "made_up";

    expect(integrityErrors(graph, refs, DOMAINS)).toHaveLength(3);
  });

  it("is deterministic in its ordering", () => {
    const { graph, refs } = cleanGraph();
    graph.edges.push(edge({ id: "E2", fromId: "A", toId: "B" }));
    refs.push({ kind: "edge", id: "E2", file: "edges.yaml" });

    const first = integrityErrors(graph, refs, DOMAINS);
    const second = integrityErrors(graph, refs, DOMAINS);
    expect(first).toEqual(second);
  });

  it("does not confuse ids across entity kinds", () => {
    // An edge and a claim may legitimately share a bare id string; only a
    // collision within one kind is a duplicate.
    const { graph, refs } = cleanGraph();
    refs.push({ kind: "edge", id: "S1", file: "edges.yaml" });
    graph.edges.push(edge({ id: "S1", fromId: "S1", toId: "M1" }));

    expect(integrityErrors(graph, refs, DOMAINS)).toEqual([]);
  });
});

describe("assertIntegrity", () => {
  it("does not throw on a clean graph", () => {
    const { graph, refs } = cleanGraph();
    expect(() => assertIntegrity(graph, refs, DOMAINS)).not.toThrow();
  });

  it("throws, naming the offending file and counting the problems", () => {
    const { graph, refs } = cleanGraph();
    graph.edges.push(edge({ id: "E2", fromId: "S1", toId: "GHOST" }));
    refs.push({
      kind: "edge",
      id: "E2",
      file: "data/democratic_backsliding/edges.yaml",
    });

    expect(() => assertIntegrity(graph, refs, DOMAINS)).toThrow(
      /Referential integrity check failed \(1 problem\)/,
    );
    expect(() => assertIntegrity(graph, refs, DOMAINS)).toThrow(
      /data\/democratic_backsliding\/edges\.yaml/,
    );
  });

  it("pluralises and lists every problem", () => {
    const { graph, refs } = cleanGraph();
    graph.edges.push(edge({ id: "E2", fromId: "NOPE", toId: "GHOST" }));
    refs.push({ kind: "edge", id: "E2", file: "edges.yaml" });

    expect(() => assertIntegrity(graph, refs, DOMAINS)).toThrow(
      /failed \(2 problems\)/,
    );
  });

  it("passes an empty graph — a repo with no data yet is not broken", () => {
    expect(() => assertIntegrity(emptyGraph(), [], DOMAINS)).not.toThrow();
  });
});
