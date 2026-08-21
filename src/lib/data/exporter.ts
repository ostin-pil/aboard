/**
 * Engine state → PR-ready file pack.
 *
 * Walks `EngineGraphData` (the client-side editor state) and emits skeletal
 * Markdown + YAML files matching the structure of `data/<domain>/`. The
 * output is the inverse of `loader.ts`: where the loader reads frontmatter
 * Markdown + YAML, this exporter writes it.
 *
 * Path (a) — skeletal export: the engine modal captures only id/kind/title/
 * body/confidence/author. The schema's richer fields (Source.kind/year/
 * finding, DataPoint, Analysis, Forecast, Dossier) are not collected by the
 * sandbox UI. The PR reviewer adds those fields before merging. Skeletal
 * files still validate because the new fields are all optional — with one
 * exception the schema makes on purpose: an edge's `rationale` is required, so
 * a drawn edge is emitted carrying `EDGE_RATIONALE_PLACEHOLDER` rather than a
 * commented-out key. `exporter.test.ts` parses every emitted file back through
 * the canonical Zod schemas, which is what keeps that promise checkable
 * instead of asserted.
 *
 * No imports from server-only code — this module runs in the browser so the
 * /graph editor can produce downloadable packs without a round-trip.
 */

// The engine renames `leverage_point` to `leverage`, so this is the one place
// the two vocabularies meet. Typing the values as `ClaimKind` rather than as a
// re-typed union means a change to the canonical enum fails here, at the
// translation boundary, instead of silently emitting a kind the loader rejects.
// Type-only import: this module runs in the browser and pulls in no Zod.
import type { ClaimKind } from "../types";
// Runtime imports, and deliberately from `ids.ts` rather than `proposals.ts`:
// same helpers, same convention, no Zod. See the header of `src/lib/ids.ts`.
import { nextSequentialId, idStem, inferDomainPrefix } from "../ids";

const KIND_MAP: Record<EngineNode["kind"], ClaimKind> = {
  symptom: "symptom",
  mechanism: "mechanism",
  leverage: "leverage_point",
};

export type PRPackFile = {
  /** Path relative to repo root, e.g. `data/<domain>/claims/<id>.md`. */
  path: string;
  body: string;
};

export type EngineToPRPackOptions = {
  /**
   * Domain to assign to nodes that have none. Sandbox-authored nodes don't
   * carry domain metadata; we need a default so files land somewhere
   * coherent. Default: the first domain present in the engine state.
   */
  defaultDomain?: string;
};

export function engineToPRPack(
  state: EngineGraphData,
  options: EngineToPRPackOptions = {}
): { files: PRPackFile[] } {
  const presentDomains = Array.from(
    new Set(state.nodes.map((n) => n.domain).filter((d): d is string => Boolean(d)))
  );
  const defaultDomain =
    options.defaultDomain ?? presentDomains[0] ?? state.domain ?? "uncategorized";

  const now = new Date().toISOString();
  const files: PRPackFile[] = [];

  for (const node of state.nodes) {
    const domain = node.domain ?? defaultDomain;
    files.push({
      path: `data/${domain}/claims/${node.id}.md`,
      body: claimMarkdown(node, domain, now),
    });
  }

  const edgesByDomain = new Map<string, EngineEdge[]>();
  const crossDomainEdges: EngineEdge[] = [];
  const domainOf = new Map<string, string>();
  for (const n of state.nodes) domainOf.set(n.id, n.domain ?? defaultDomain);
  for (const edge of state.edges) {
    const fromD = domainOf.get(edge.from);
    const toD = domainOf.get(edge.to);
    if (fromD && toD && fromD === toD) {
      const arr = edgesByDomain.get(fromD) ?? [];
      arr.push(edge);
      edgesByDomain.set(fromD, arr);
    } else {
      crossDomainEdges.push(edge);
    }
  }

  for (const [domain, edges] of edgesByDomain.entries()) {
    const claimIdsInDomain = state.nodes
      .filter((n) => (n.domain ?? defaultDomain) === domain)
      .map((n) => n.id);
    files.push({
      path: `data/${domain}/edges.yaml`,
      body: edgesYaml(assignEdgeIds(edges, edgeStem(edges, claimIdsInDomain))),
    });
  }

  if (crossDomainEdges.length > 0) {
    files.push({
      path: `data/cross_domain_edges.yaml`,
      body: edgesYaml(assignEdgeIds(crossDomainEdges, edgeStem(crossDomainEdges, [], "CE"))),
    });
  }

  files.push({ path: "PR-PACK-README.md", body: prPackReadme(state, defaultDomain) });

  return { files };
}

function claimMarkdown(node: EngineNode, domain: string, now: string): string {
  const kind = KIND_MAP[node.kind];
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: ${node.id}`);
  lines.push(`kind: ${kind}`);
  lines.push(`title: ${yamlQuote(node.title)}`);
  lines.push(`domain: ${domain}`);
  lines.push(`confidence: ${(node.conf ?? 0.5).toFixed(2)}`);
  lines.push(`sources: []`);
  lines.push(`# dataPoints: []         # PR reviewer: add quantitative anchors if claim is empirical`);
  lines.push(`# analyses: []           # PR reviewer: reference Analysis IDs if this claim has analysis trails`);
  lines.push(`authoredBy:`);
  lines.push(`  agent: ${node.author ?? "agent:sandbox/v0"}`);
  lines.push(`  promptTitle: Sandbox-authored claim v0.1`);
  lines.push(`  generatedAt: '${now}'`);
  lines.push(`createdAt: '${now}'`);
  lines.push("---");
  lines.push(node.body?.trim() ?? "");
  lines.push("");
  return lines.join("\n");
}

/**
 * What a sandbox-drawn edge carries where its rationale will go.
 *
 * Exported so the tests assert against the same string the emitter writes, and
 * so a reviewer grepping `data/` for un-filled placeholders has one term.
 */
export const EDGE_RATIONALE_PLACEHOLDER =
  "PR REVIEWER: state the reasoning for this relation before merging.";

/** An edge paired with the id it will be written under. */
type IdentifiedEdge = { edge: EngineEdge; id: string; minted: boolean };

/**
 * The id stem this file's edges are numbered on.
 *
 * Read off the edges themselves first: an edge that came from `data/` carries
 * its id, and the stem of those ids is the answer by definition. Falling back
 * to the domain's claim ids covers the case with no seeded edges at all (a new
 * domain, or one whose only edges are sandbox-drawn), and uses the same
 * `inferDomainPrefix` rule the Worker's write path uses, so the sandbox and
 * the API mint under one convention rather than two copies of it.
 *
 * `E` last, because the fallback of a fallback should be the majority spelling
 * rather than a throw the export cannot recover from.
 */
function edgeStem(
  edges: EngineEdge[],
  claimIdsInDomain: readonly string[],
  fallback = "E",
): string {
  const stems = new Set<string>();
  for (const e of edges) {
    if (!e.canonicalId) continue;
    const stem = idStem(e.canonicalId);
    if (stem) stems.add(stem);
  }
  if (stems.size === 1) return [...stems][0];

  const prefix = inferDomainPrefix(claimIdsInDomain);
  if (prefix !== null) return `${prefix}E`;

  return fallback;
}

/**
 * Give every edge in one file an id: its own where it has one, a fresh one
 * continuing past the file's maximum where it does not.
 *
 * This is E12. The exporter used to number every edge from `E1` regardless of
 * what `data/` already held, and the PR-pack README told the contributor to
 * drop the files in — so for any domain with existing edges, the export both
 * collided with live ids and, being a whole-file replacement, deleted every
 * edge the sandbox had not been shown. Integrity passed afterwards, because
 * the evidence of what was lost went with it.
 *
 * Minting from `taken` rather than from a counter is what makes the ids safe:
 * a sandbox edge drawn between two seeded ones lands after the file's maximum,
 * not on top of `E2`.
 */
function assignEdgeIds(edges: EngineEdge[], stem: string): IdentifiedEdge[] {
  const taken: string[] = [];
  for (const e of edges) if (e.canonicalId) taken.push(e.canonicalId);

  return edges.map((edge) => {
    if (edge.canonicalId) return { edge, id: edge.canonicalId, minted: false };
    const id = nextSequentialId(stem, taken);
    taken.push(id);
    return { edge, id, minted: true };
  });
}

/**
 * The whole edge set for one file, as YAML.
 *
 * The merged set, not a fragment: the sandbox is an editor over the real graph,
 * so a contributor can move, retarget or delete a seeded edge, and only a
 * whole-file emit can express a deletion. That makes fidelity on the edges it
 * did not touch the load-bearing property — an edge written back with a
 * placeholder strength or a dropped rationale is a silent edit to `data/`
 * hiding inside a PR that claims to add one relation.
 *
 * So a seeded edge round-trips: its id, its calibrated strength, its rationale
 * and its sources. Only an edge the sandbox authored gets the reviewer
 * placeholders, and those are the lines a reviewer is meant to stop on.
 */
function edgesYaml(identified: IdentifiedEdge[]): string {
  const lines: string[] = [];
  for (const { edge: e, id, minted } of identified) {
    lines.push(`- id: ${id}`);
    lines.push(`  fromId: ${e.from}`);
    lines.push(`  toId: ${e.to}`);
    lines.push(`  kind: ${e.kind}`);
    if (e.strength === undefined) {
      lines.push(`  strength: 0.5  # PR reviewer: tune strength`);
    } else {
      lines.push(`  strength: ${e.strength}`);
    }
    if (e.rationale) {
      lines.push(`  rationale: ${yamlQuote(e.rationale)}`);
    } else if (minted) {
      // A placeholder value, not a commented-out key. `Edge.rationale` is
      // required — the schema's comment says why: the graph classifies
      // relations on stated reasoning rather than on edge counts, so the
      // reasoning has to always be there to read. A commented-out key made
      // every pack containing a sandbox-drawn edge fail the loader on the
      // field, which contradicted this module's own promise that skeletal
      // files validate, and it failed at `npm run build` after the drop-in
      // rather than at the validator step the README sends you to.
      //
      // The text is deliberately unmissable in a diff: a reviewer who lands it
      // unchanged has published the placeholder, and it reads as one.
      lines.push(`  rationale: ${yamlQuote(EDGE_RATIONALE_PLACEHOLDER)}`);
    }
    if (e.sources && e.sources.length > 0) {
      lines.push(`  sources:`);
      for (const src of e.sources) {
        lines.push(`    - label: ${yamlQuote(src.label)}`);
        lines.push(`      url: ${yamlQuote(src.url)}`);
        if (src.kind) lines.push(`      kind: ${yamlQuote(src.kind)}`);
        if (src.finding) lines.push(`      finding: ${yamlQuote(src.finding)}`);
      }
    } else if (minted) {
      lines.push(`  # sources: []   # PR reviewer to add evidence for the relation`);
    }
  }
  return lines.join("\n") + "\n";
}

function yamlQuote(s: string): string {
  // Single-quote unless string contains single quotes; if it does, fall back
  // to a double-quoted form. Keep it simple — sandbox titles shouldn't be
  // exotic.
  if (!/[:#&*?{}[\],|>!%@`"\n]/.test(s) && !s.startsWith(" ") && !s.endsWith(" ")) {
    return s;
  }
  if (!s.includes("'")) return `'${s}'`;
  return JSON.stringify(s);
}

function prPackReadme(state: EngineGraphData, defaultDomain: string): string {
  const claimCount = state.nodes.length;
  const edgeCount = state.edges.length;
  return [
    "# aboard PR pack",
    "",
    `This zip was emitted by the \`/graph\` sandbox on ${new Date().toISOString().slice(0, 10)}.`,
    "It contains skeletal claim and edge files for the aboard CMS.",
    "",
    `**Contents:** ${claimCount} claim file(s), ${edgeCount} edge(s).`,
    `**Default domain (for sandbox-authored claims without one):** ${defaultDomain}`,
    "",
    "## How to file these claims",
    "",
    "1. Clone the aboard repo and check out a working branch.",
    "2. Drop the files in this zip into `data/` at the indicated paths,",
    "   preserving the directory structure. Each `edges.yaml` is the *whole*",
    "   edge set for that file, not an addition to it: edges that came from",
    "   `data/` keep their ids, strengths, rationales and sources, and edges",
    "   drawn in the sandbox are numbered after the highest id already there.",
    "   Read the diff before committing — a relation you moved or deleted in",
    "   the sandbox shows up here as a change to a live edge, which is a",
    "   heavier claim than adding one.",
    "3. Open each new `.md` and `.yaml` file and add the fields the PR reviewer",
    "   needs: real Source citations (label + URL + kind + finding),",
    "   DataPoints where the claim is empirical, edge rationales, Source",
    "   evidence on edges.",
    "4. Run the validator: `npx tsx clients/validate.ts http://localhost:3000/api/graph`.",
    "5. Open a pull request. The reviewer will check sources, calibrate",
    "   confidence and strength, and harmonize with existing claims.",
    "",
    "## Why skeletons, not full content",
    "",
    "The `/graph` sandbox is for brainstorming claim *skeletons* — proposing",
    "the shape of a claim or causal edge without yet sourcing every backing",
    "study. The PR review step is where evidence gets attached. Sandbox-only",
    "edits stay in your browser and do not file claims.",
    "",
    "See `/about#contributing` for the full workflow.",
    "",
  ].join("\n");
}
