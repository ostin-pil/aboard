import { describe, it, expect, vi } from "vitest";
import YAML from "yaml";
import matter from "gray-matter";
import { Claim, Edge } from "@/lib/types";
import { engineToPRPack, EDGE_RATIONALE_PLACEHOLDER } from "@/lib/data/exporter";
import { toEngineData } from "@/lib/engine-adapter";

/**
 * The PR-pack exporter, which is the sandbox's only write to `data/`.
 *
 * Two halves. The synthetic fixtures below pin the id and fidelity rules edge
 * by edge; the last block runs the real graph through the whole chain
 * (`data/` → loader → `toEngineData` → exporter) and asserts nothing changed,
 * which is the property E12 was actually about: an export taken over an
 * untouched graph must be a no-op against the files it claims to replace.
 *
 * `server-only` is mocked away for the second half. The loader is the one
 * module the unit project otherwise stays out of; see
 * `src/lib/data/loader.test.ts` for that argument. Here it is the fixture —
 * the defect only shows against ids that really exist.
 */
vi.mock("server-only", () => ({}));

const { getGraph } = await import("@/lib/data/loader");

/** A seeded edge, as `toEngineData` produces one. */
function seeded(over: Partial<EngineEdge> & Pick<EngineEdge, "from" | "to">): EngineEdge {
  return { kind: "causes", canonicalId: "E1", strength: 0.7, ...over };
}

/** A sandbox-drawn edge: no id, no strength. */
function drawn(from: string, to: string, kind: EngineEdge["kind"] = "causes"): EngineEdge {
  return { from, to, kind };
}

function node(id: string, domain: string, row: 1 | 2 | 3 = 1, col = 0): EngineNode {
  return { id, kind: "symptom", title: `Claim ${id}`, row, col, domain };
}

/** The `data/<domain>/edges.yaml` file body from a pack, parsed. */
function edgesFor(files: { path: string; body: string }[], domain: string): unknown[] {
  const file = files.find((f) => f.path === `data/${domain}/edges.yaml`);
  if (!file) throw new Error(`no edges.yaml emitted for ${domain}`);
  return YAML.parse(file.body) as unknown[];
}

describe("engineToPRPack: edge identity", () => {
  it("keeps a seeded edge's id rather than re-minting from E1", () => {
    const { files } = engineToPRPack({
      nodes: [node("S1", "democratic_backsliding"), node("M1", "democratic_backsliding", 2)],
      edges: [seeded({ from: "M1", to: "S1", canonicalId: "E7" })],
    });
    const edges = edgesFor(files, "democratic_backsliding") as { id: string }[];
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("E7");
  });

  it("mints a drawn edge after the file's highest id, not at E1", () => {
    const { files } = engineToPRPack({
      nodes: [
        node("S1", "democratic_backsliding"),
        node("M1", "democratic_backsliding", 2),
        node("L1", "democratic_backsliding", 3),
      ],
      edges: [
        seeded({ from: "M1", to: "S1", canonicalId: "E3" }),
        seeded({ from: "L1", to: "S1", canonicalId: "E9" }),
        drawn("L1", "M1", "reduces"),
      ],
    });
    const ids = (edgesFor(files, "democratic_backsliding") as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual(["E3", "E9", "E10"]);
  });

  it("numbers several drawn edges without colliding with each other", () => {
    const { files } = engineToPRPack({
      nodes: [node("S1", "d"), node("M1", "d", 2), node("L1", "d", 3)],
      edges: [seeded({ from: "M1", to: "S1", canonicalId: "E4" }), drawn("L1", "S1"), drawn("L1", "M1")],
    });
    const ids = (edgesFor(files, "d") as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual(["E4", "E5", "E6"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mints on the domain's own stem, read off its seeded edges", () => {
    const { files } = engineToPRPack({
      nodes: [node("IS1", "inequality"), node("IM1", "inequality", 2)],
      edges: [seeded({ from: "IM1", to: "IS1", canonicalId: "IE6" }), drawn("IS1", "IM1")],
    });
    const ids = (edgesFor(files, "inequality") as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual(["IE6", "IE7"]);
  });

  it("falls back to the domain's claim-id prefix when it has no seeded edges", () => {
    // A domain the sandbox has only drawn in. `ECS1`/`ECM1` say the prefix is
    // `EC`, so the edge stem is `ECE` — the same rule the Worker's write path
    // applies, rather than a second copy of it.
    const { files } = engineToPRPack({
      nodes: [node("ECS1", "epistack_cases"), node("ECM1", "epistack_cases", 2)],
      edges: [drawn("ECM1", "ECS1")],
    });
    const ids = (edgesFor(files, "epistack_cases") as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual(["ECE1"]);
  });

  it("sends a cross-domain edge to its own file on the CE stem", () => {
    const { files } = engineToPRPack({
      nodes: [node("IM3", "inequality"), node("S2", "democratic_backsliding")],
      edges: [seeded({ from: "IM3", to: "S2", canonicalId: "CE1" }), drawn("S2", "IM3")],
    });
    const cross = YAML.parse(
      files.find((f) => f.path === "data/cross_domain_edges.yaml")!.body,
    ) as { id: string }[];
    expect(cross.map((e) => e.id)).toEqual(["CE1", "CE2"]);
  });
});

describe("engineToPRPack: fidelity of edges the sandbox did not author", () => {
  const withEverything = seeded({
    from: "M1",
    to: "S1",
    canonicalId: "E5",
    strength: 0.85,
    rationale: "A rationale a reviewer calibrated by hand.",
    sources: [
      { label: "V-Dem 2024", url: "https://v-dem.net/data/", kind: "dataset", finding: "A finding." },
    ],
  });

  const { files } = engineToPRPack({
    nodes: [node("S1", "d"), node("M1", "d", 2)],
    edges: [withEverything],
  });
  const [out] = edgesFor(files, "d") as Record<string, unknown>[];

  it("round-trips the calibrated strength instead of the placeholder", () => {
    expect(out.strength).toBe(0.85);
  });

  it("round-trips the rationale", () => {
    expect(out.rationale).toBe("A rationale a reviewer calibrated by hand.");
  });

  it("round-trips the sources, with their kind and finding", () => {
    expect(out.sources).toEqual([
      { label: "V-Dem 2024", url: "https://v-dem.net/data/", kind: "dataset", finding: "A finding." },
    ]);
  });

  it("emits an edge that validates under the canonical Edge schema", () => {
    expect(Edge.safeParse(out).success).toBe(true);
  });
});

describe("engineToPRPack: edges the sandbox did author", () => {
  const { files } = engineToPRPack({
    nodes: [node("S1", "d"), node("M1", "d", 2)],
    edges: [drawn("M1", "S1")],
  });
  const body = files.find((f) => f.path === "data/d/edges.yaml")!.body;

  it("carries the placeholder strength and the reviewer prompts", () => {
    expect(body).toContain("strength: 0.5  # PR reviewer: tune strength");
    expect(body).toContain(EDGE_RATIONALE_PLACEHOLDER);
    expect(body).toContain("# sources: []");
  });

  // The promise in this module's header, made checkable. `Edge.rationale` is
  // required, so emitting the key as a comment produced a pack that failed the
  // loader on the field — after the contributor had already dropped it into
  // `data/`, which is the worst place to find out.
  it("validates under the canonical Edge schema as emitted", () => {
    const [parsed] = YAML.parse(body) as Record<string, unknown>[];
    expect(parsed.strength).toBe(0.5);
    expect(parsed.rationale).toBe(EDGE_RATIONALE_PLACEHOLDER);
    expect(Edge.safeParse(parsed).success).toBe(true);
  });
});

describe("engineToPRPack: claim files", () => {
  const { files } = engineToPRPack({
    nodes: [
      {
        id: "S9",
        kind: "leverage",
        title: "A title with: a colon",
        body: "The statement.",
        conf: 0.62,
        author: "agent:test/v0",
        row: 3,
        col: 0,
        domain: "d",
      },
    ],
    edges: [],
  });

  it("writes each claim to its domain's claims directory", () => {
    expect(files.some((f) => f.path === "data/d/claims/S9.md")).toBe(true);
  });

  it("maps the engine's `leverage` back to the canonical `leverage_point`", () => {
    const { data } = matter(files.find((f) => f.path === "data/d/claims/S9.md")!.body);
    expect(data.kind).toBe("leverage_point");
  });

  it("emits frontmatter that parses and validates under the Claim schema", () => {
    const file = files.find((f) => f.path === "data/d/claims/S9.md")!;
    const { data, content } = matter(file.body);
    const parsed = Claim.safeParse({ ...data, statement: content.trim() });
    expect(parsed.success).toBe(true);
  });
});

describe("engineToPRPack over the real graph", () => {
  // The whole point of E12, stated as a property: export a graph nobody edited
  // and the result must be the same edges, under the same ids, at the same
  // strengths. Before the fix this block failed on the first assertion — every
  // domain's edges came back numbered from `E1`.
  const graph = getGraph();
  const { files } = engineToPRPack(toEngineData(graph));

  const emitted = files
    .filter((f) => f.path.endsWith("edges.yaml"))
    .flatMap((f) => YAML.parse(f.body) as Record<string, unknown>[]);

  it("emits an edges file for every domain that has edges, plus the cross-domain one", () => {
    expect(files.some((f) => f.path === "data/cross_domain_edges.yaml")).toBe(true);
    expect(emitted.length).toBe(graph.edges.length);
  });

  it("preserves every edge id exactly", () => {
    expect(new Set(emitted.map((e) => e.id))).toEqual(new Set(graph.edges.map((e) => e.id)));
  });

  it("preserves every edge's calibrated strength", () => {
    const byId = new Map(graph.edges.map((e) => [e.id, e.strength]));
    for (const e of emitted) {
      expect(e.strength, `strength for ${String(e.id)}`).toBe(byId.get(String(e.id)));
    }
  });

  it("preserves every edge's rationale", () => {
    const byId = new Map(graph.edges.map((e) => [e.id, e.rationale]));
    for (const e of emitted) {
      expect(e.rationale, `rationale for ${String(e.id)}`).toBe(byId.get(String(e.id)));
    }
  });

  it("emits edges that all validate under the canonical Edge schema", () => {
    for (const e of emitted) {
      const parsed = Edge.safeParse(e);
      expect(parsed.success, `${String(e.id)}: ${parsed.error?.message}`).toBe(true);
    }
  });

  it("routes each edge to the file the loader would read it from", () => {
    const domainOf = new Map(graph.claims.map((c) => [c.id, c.domain]));
    for (const file of files.filter((f) => f.path.endsWith("edges.yaml"))) {
      for (const e of YAML.parse(file.body) as Record<string, string>[]) {
        const from = domainOf.get(e.fromId);
        const to = domainOf.get(e.toId);
        const expected =
          from === to ? `data/${from}/edges.yaml` : "data/cross_domain_edges.yaml";
        expect(file.path, `${e.id} (${from} → ${to})`).toBe(expected);
      }
    }
  });
});
