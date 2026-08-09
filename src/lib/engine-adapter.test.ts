import { describe, it, expect } from "vitest";
import { toEngineData } from "@/lib/engine-adapter";
import { EdgeKind } from "@/lib/types";
import type { Claim, Edge, ClaimGraph } from "@/lib/types";

/**
 * The adapter had no test surface at all until session 49, which is why A4
 * survived three audits: `SUPPORTED_EDGE_KINDS` listed three of the four
 * canonical edge kinds and dropped the rest on the floor, and nothing in the
 * repo could observe it. `grep evidences data/` was empty, so the loss was
 * latent, but `mcp-server/src/tools/write.ts` accepts `evidences` on the live
 * write path, so an agent could mint one and watch it vanish from the graph.
 */

const agent = { agent: "claude-opus-4-8", generatedAt: "2026-08-09T00:00:00Z" };

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
  createdAt: "2026-08-09",
  ...over,
});

const edge = (over: Partial<Edge> & Pick<Edge, "id" | "fromId" | "toId">): Edge => ({
  kind: "causes",
  strength: 0.5,
  rationale: "A stated reason.",
  sources: [],
  ...over,
});

const graph = (over: Partial<ClaimGraph>): ClaimGraph => ({
  claims: [],
  edges: [],
  forecasts: [],
  dossiers: [],
  analyses: [],
  ...over,
});

describe("toEngineData", () => {
  it("carries an edge of every canonical kind through to the engine", () => {
    const claims = [
      claim({ id: "S1", kind: "symptom" }),
      claim({ id: "M1", kind: "mechanism" }),
    ];
    const edges = EdgeKind.options.map((kind, i) =>
      edge({ id: `e${i}`, fromId: "S1", toId: "M1", kind }),
    );

    const data = toEngineData(graph({ claims, edges }));

    expect(data.edges.map((e) => e.kind).sort()).toEqual([...EdgeKind.options].sort());
  });

  it("keeps an evidences edge, the kind the adapter used to drop", () => {
    const claims = [
      claim({ id: "S1", kind: "symptom" }),
      claim({ id: "M1", kind: "mechanism" }),
    ];
    const edges = [edge({ id: "e1", fromId: "S1", toId: "M1", kind: "evidences" })];

    const data = toEngineData(graph({ claims, edges }));

    expect(data.edges).toHaveLength(1);
    expect(data.edges[0].kind).toBe("evidences");
  });

  it("still drops an edge whose endpoints are outside the selected domain", () => {
    const claims = [
      claim({ id: "S1", kind: "symptom", domain: "democratic_backsliding" }),
      claim({ id: "IS1", kind: "symptom", domain: "inequality" }),
    ];
    const edges = [edge({ id: "e1", fromId: "S1", toId: "IS1", kind: "evidences" })];

    const data = toEngineData(graph({ claims, edges }), {
      domain: "democratic_backsliding",
    });

    // Endpoint filtering is the one filter the adapter should still apply:
    // removing the kind filter must not have widened this.
    expect(data.edges).toHaveLength(0);
  });

  it("marks an edge crossing domains", () => {
    const claims = [
      claim({ id: "S1", domain: "democratic_backsliding" }),
      claim({ id: "IM1", kind: "mechanism", domain: "inequality" }),
    ];
    const edges = [edge({ id: "e1", fromId: "S1", toId: "IM1", kind: "evidences" })];

    const data = toEngineData(graph({ claims, edges }));

    expect(data.edges[0].crossDomain).toBe(true);
  });
});
