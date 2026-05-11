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
 * files still validate because the new fields are all optional.
 *
 * No imports from server-only code — this module runs in the browser so the
 * /graph editor can produce downloadable packs without a round-trip.
 */

const KIND_MAP: Record<EngineNode["kind"], "symptom" | "mechanism" | "leverage_point"> = {
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

  let edgeSeq = 1;
  for (const [domain, edges] of edgesByDomain.entries()) {
    files.push({
      path: `data/${domain}/edges.yaml`,
      body: edgesYaml(edges, () => `E${edgeSeq++}`),
    });
  }

  if (crossDomainEdges.length > 0) {
    files.push({
      path: `data/cross_domain_edges.yaml`,
      body: edgesYaml(crossDomainEdges, () => `CE${edgeSeq++}`),
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

function edgesYaml(edges: EngineEdge[], nextId: () => string): string {
  const lines: string[] = [];
  for (const e of edges) {
    lines.push(`- id: ${nextId()}`);
    lines.push(`  fromId: ${e.from}`);
    lines.push(`  toId: ${e.to}`);
    lines.push(`  kind: ${e.kind}`);
    lines.push(`  strength: 0.5  # PR reviewer: tune strength`);
    lines.push(`  # rationale: PR reviewer to populate`);
    lines.push(`  # sources: []   # PR reviewer to add evidence for the relation`);
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
    "   preserving the directory structure.",
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
