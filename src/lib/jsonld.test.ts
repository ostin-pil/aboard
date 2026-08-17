import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, it, expect } from "vitest";
import { graphLD, fullClaimLD, dossierLD, ldJsonScript } from "@/lib/jsonld";
import {
  Analysis,
  Claim,
  Dossier,
  Edge,
  Forecast,
  type ClaimGraph,
} from "@/lib/types";

/**
 * The serializers against the schema they promise to satisfy.
 *
 * `public/schema/v0.json` is the published contract, and until this test
 * existed nothing in `npm test` checked the serializers against it. The only
 * enforcement was `clients/validate.ts` in CI, which needs a built export and a
 * running server, so drift surfaced at the last CI step as an Ajv error far
 * from the file that caused it. Sessions 47, 48 and 49 each had to run that
 * check by hand.
 *
 * `tsc` will not catch this class of bug either: the serializers declare no
 * return types, so dropping a schema-required field just narrows the inferred
 * type and compiles clean. Session 48 confirmed that by deleting a field from
 * `edgeLD` and watching the whole gate pass.
 *
 * Two things are asserted, and the pairing is the point:
 *
 * 1. The fixture graph is valid *input* per the Zod schemas in `types.ts`.
 * 2. What the serializers make of it is valid *output* per `v0.json`.
 *
 * Either alone is weak. Together they pin the two ends of the contract, so a
 * change to `types.ts` that `v0.json` was never told about fails here, naming
 * the field, rather than in the CI tail.
 */

const SCHEMA_PATH = join(process.cwd(), "public", "schema", "v0.json");
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<string, unknown>;

const BASE = "https://aboard.untype.me";

// Same construction as `clients/validate.ts`, so this test and the CI check
// cannot disagree about what "valid" means. `strict: false` because the schema
// carries descriptive keywords Ajv's strict mode rejects.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default(ajv);
ajv.addSchema(schema);

/** The published root: a `oneOf` over the two response shapes. */
const validateRoot = ajv.compile(schema);

/** A named branch, for error messages that say which shape failed and why. */
function branch(name: string): ValidateFunction {
  const ref = `${schema["$id"] as string}#/$defs/${name}`;
  const fn = ajv.getSchema(ref);
  if (!fn) throw new Error(`schema has no $defs/${name}`);
  return fn;
}

function errorsOf(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map(
    (e) => `${e.instancePath || "(root)"} ${e.message ?? ""} ${JSON.stringify(e.params)}`.trim(),
  );
}

/**
 * Assert a document satisfies the published schema.
 *
 * Checks the named branch first purely for the error message: a failure against
 * the root `oneOf` reports every mismatch from both branches at once, which
 * buries the one that matters. The root check is the real assertion.
 */
function expectValid(doc: unknown, branchName: string): void {
  const validateBranch = branch(branchName);
  if (!validateBranch(doc)) {
    throw new Error(`${branchName} is invalid:\n  ${errorsOf(validateBranch).join("\n  ")}`);
  }
  expect(validateRoot(doc), errorsOf(validateRoot).join("; ")).toBe(true);
}

// --- fixture ---------------------------------------------------------------

const attribution = {
  agent: "claude-opus-4-8",
  promptTitle: "Fixture",
  generatedAt: "2026-08-09T00:00:00Z",
  operator: "Untype",
  agentId: "cfg-1",
};

const source = {
  label: "V-Dem democracy reports",
  url: "https://v-dem.net/publications/democracy-reports/",
  kind: "dataset" as const,
  year: 2026,
  authors: "V-Dem Institute",
  finding: "Liberal Democracy Index by country and year.",
  excerpt: "A quoted passage.",
};

/** Deliberately minimal: only what the schema requires, nothing optional. */
const bareSource = { label: "Bare", url: "https://example.org/" };

const claims: Claim[] = [
  {
    id: "S1",
    kind: "symptom",
    title: "A symptom",
    statement: "Something observable and falsifiable.",
    domain: "democratic_backsliding",
    confidence: 0.7,
    sources: [source, bareSource],
    dataPoints: [
      {
        metric: "Liberal Democracy Index",
        value: 0.42,
        unit: "index",
        period: "2024",
        geography: "OECD",
        source,
        note: "A note.",
      },
    ],
    analyses: ["AN1"],
    authoredBy: attribution,
    createdAt: "2026-08-09T00:00:00Z",
  },
  {
    id: "M1",
    kind: "mechanism",
    title: "A mechanism",
    statement: "What produces the symptom.",
    domain: "democratic_backsliding",
    confidence: 0.6,
    sources: [bareSource],
    dataPoints: [],
    analyses: [],
    authoredBy: { agent: "claude-opus-4-8", generatedAt: "2026-08-09T00:00:00Z" },
    createdAt: "2026-08-09T00:00:00Z",
  },
  {
    id: "IL1",
    kind: "leverage_point",
    title: "A leverage point",
    statement: "Where intervention acts.",
    domain: "inequality",
    confidence: 0.4,
    sources: [bareSource],
    dataPoints: [],
    analyses: [],
    authoredBy: attribution,
    createdAt: "2026-08-09T00:00:00Z",
  },
];

/** Every edge kind, `evidences` included — it reaches the renderer as of session 49. */
const edges: Edge[] = [
  { id: "E1", fromId: "M1", toId: "S1", kind: "causes", strength: 0.8, rationale: "Because.", sources: [source] },
  { id: "E2", fromId: "IL1", toId: "M1", kind: "reduces", strength: 0.5, rationale: "Because.", sources: [] },
  { id: "E3", fromId: "M1", toId: "S1", kind: "moderates", strength: 0.3, rationale: "Because.", sources: [] },
  { id: "E4", fromId: "S1", toId: "M1", kind: "evidences", strength: 0.6, rationale: "Because.", sources: [bareSource] },
];

const forecasts: Forecast[] = [
  {
    id: "F1",
    attachedToClaimId: "S1",
    question: "Will it?",
    resolutionDate: "2027-01-01",
    resolutionCriteria: "Resolves YES if the index falls below 0.40.",
    resolutionSource: source,
    predictions: [
      {
        agent: attribution,
        probability: 0.35,
        reasoning: "Because of the trend.",
        baseRates: [{ question: "How often historically?", rate: 0.2, source }],
        dataAnchors: [source],
        createdAt: "2026-08-09T00:00:00Z",
      },
    ],
  },
  {
    // Minimal, and resolved: exercises the resolution fields together.
    id: "F2",
    attachedToClaimId: "M1",
    question: "Did it?",
    resolutionDate: "2026-01-01",
    resolutionCriteria: "Resolves YES if it did.",
    resolvedOutcome: "yes",
    resolvedAt: "2026-01-02T00:00:00Z",
    predictions: [],
  },
];

const dossiers: Dossier[] = [
  {
    attachedToClaimId: "S1",
    pro: {
      thesis: "It holds.",
      steelmannedSummary: "The strongest honest case that it holds.",
      keySources: [source],
      authoredBy: attribution,
    },
    con: {
      thesis: "It does not.",
      steelmannedSummary: "The strongest honest case against.",
      keySources: [bareSource],
      authoredBy: attribution,
    },
    cruxes: [{ statement: "What would settle it?", impactScore: 0.8, uncertainty: 0.6 }],
  },
];

const analyses: Analysis[] = [
  {
    id: "AN1",
    domain: "democratic_backsliding",
    kind: "synthesis",
    title: "An analysis",
    summary: "What it found.",
    methodology: "How it looked.",
    dataSources: [source],
    producedFinding: "The finding.",
    authoredBy: attribution,
    createdAt: "2026-08-09T00:00:00Z",
  },
];

const fixture: ClaimGraph = { claims, edges, forecasts, dossiers, analyses };

// --- tests -----------------------------------------------------------------

describe("the fixture is valid input", () => {
  // If this block fails, the fixture drifted from types.ts and the schema
  // assertions below would be testing a graph the loader would have rejected.
  it("parses under the canonical Zod schemas", () => {
    expect(() => {
      claims.forEach((c) => Claim.parse(c));
      edges.forEach((e) => Edge.parse(e));
      forecasts.forEach((f) => Forecast.parse(f));
      dossiers.forEach((d) => Dossier.parse(d));
      analyses.forEach((a) => Analysis.parse(a));
    }).not.toThrow();
  });

  it("covers every claim kind and every edge kind", () => {
    expect(new Set(claims.map((c) => c.kind))).toEqual(
      new Set(["symptom", "mechanism", "leverage_point"]),
    );
    expect(new Set(edges.map((e) => e.kind))).toEqual(
      new Set(["causes", "moderates", "reduces", "evidences"]),
    );
  });
});

describe("graphLD against v0.json", () => {
  it("validates", () => {
    expectValid(graphLD(fixture, BASE), "ClaimGraphResponse");
  });

  it("validates a graph with no analyses, where the key is omitted", () => {
    const doc = graphLD({ ...fixture, analyses: [] }, BASE) as Record<string, unknown>;
    expect(doc).not.toHaveProperty("aboard:analyses");
    expectValid(doc, "ClaimGraphResponse");
  });

  it("validates an empty graph", () => {
    expectValid(
      graphLD({ claims: [], edges: [], forecasts: [], dossiers: [], analyses: [] }, BASE),
      "ClaimGraphResponse",
    );
  });

  it("sorts the domains it reports", () => {
    const doc = graphLD(fixture, BASE) as { "aboard:domains": string[] };
    expect(doc["aboard:domains"]).toEqual(["democratic_backsliding", "inequality"]);
  });
});

describe("fullClaimLD against v0.json", () => {
  it("validates a claim that has a dossier", () => {
    const doc = fullClaimLD(claims[0], fixture, BASE) as Record<string, unknown>;
    expect(doc).toHaveProperty("aboard:dossier");
    expectValid(doc, "FullClaimResponse");
  });

  it("validates a claim that has none, where the key is omitted", () => {
    const doc = fullClaimLD(claims[2], fixture, BASE) as Record<string, unknown>;
    expect(doc).not.toHaveProperty("aboard:dossier");
    expectValid(doc, "FullClaimResponse");
  });
});

describe("ldJsonScript", () => {
  // S1. The claim and dossier pages embed these documents in a
  // `<script type="application/ld+json">` block, whose content is raw text: the
  // HTML parser scans it for `</script` and nothing else. `JSON.stringify`
  // leaves `<` alone, so a statement carrying a literal `</script>` would close
  // the block and turn the remainder of the document into live markup. Every
  // string field here is agent-proposed through `POST /api/proposals`, which
  // bounds length and not characters.
  const HOSTILE = '</script><img src=x onerror="alert(1)">';

  it("emits no raw < for a claim whose statement closes the script block", () => {
    const claim = { ...claims[0], statement: HOSTILE, title: HOSTILE };
    const embedded = ldJsonScript(fullClaimLD(claim, fixture, BASE));
    expect(embedded).not.toContain("<");
  });

  it("emits no raw < for a dossier whose theses close the script block", () => {
    const base = dossiers[0];
    const dossier = {
      ...base,
      pro: { ...base.pro, thesis: HOSTILE },
      con: { ...base.con, steelmannedSummary: HOSTILE },
    };
    const embedded = ldJsonScript(dossierLD(dossier, BASE));
    expect(embedded).not.toContain("<");
  });

  // The escape has to be lossless, or the fix would trade an injection for
  // corrupted output that no consumer could round-trip.
  it("round-trips to the same document a bare stringify would produce", () => {
    const claim = { ...claims[0], statement: HOSTILE };
    const doc = fullClaimLD(claim, fixture, BASE);
    expect(JSON.parse(ldJsonScript(doc))).toEqual(doc);
  });

  it("leaves a document with no angle brackets byte-identical", () => {
    const doc = graphLD(fixture, BASE);
    expect(ldJsonScript(doc)).toBe(JSON.stringify(doc));
  });
});
