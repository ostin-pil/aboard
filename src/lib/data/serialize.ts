import YAML, { Scalar, visit } from "yaml";
import type { Claim, Edge } from "@/lib/types";

/**
 * YAML resolves an *unquoted* ISO date or datetime to its timestamp type, and
 * the loader's parser (gray-matter → js-yaml) therefore hands it back as a
 * `Date`. Our schema types those fields as strings, so an unquoted timestamp
 * does not round-trip: the file is written, and then fails to parse.
 *
 * Every hand-authored file in `data/` quotes its timestamps for exactly this
 * reason. The serializer has to do the same, and the round-trip tests in
 * serialize/proposals.test.ts are what keep it honest.
 */
const YAML_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:[Tt ].*)?$/;

/** Force single-quotes on any scalar that YAML would otherwise read back as a Date. */
function quoteTimestamps(doc: YAML.Document): void {
  visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value === "string" && YAML_TIMESTAMP.test(node.value)) {
        node.type = Scalar.QUOTE_SINGLE;
      }
    },
  });
}

// lineWidth: 0 disables line folding. Folded prose round-trips fine, but the
// diff a human reviews in the PR is far uglier.
const STRINGIFY = { lineWidth: 0 } as const;

/**
 * Claim → the Markdown file the loader reads back.
 *
 * The exact inverse of `loadClaim()` in loader.ts: frontmatter is the metadata,
 * the body is the statement. Round-tripping is a tested property, not an
 * assumption — this is what the agent write path commits, and a file that does
 * not parse back is a broken PR.
 *
 * Pure and filesystem-free on purpose: it runs inside a Cloudflare Worker,
 * where there is no `fs`.
 */
export function claimToMarkdown(claim: Claim): string {
  const { statement, ...frontmatter } = claim;
  const doc = new YAML.Document(frontmatter);
  quoteTimestamps(doc);
  return `---\n${doc.toString(STRINGIFY)}---\n\n${statement.trim()}\n`;
}

/** Repo-relative path a claim belongs at, per the layout in CLAUDE.md. */
export function claimPath(claim: Pick<Claim, "id" | "domain">): string {
  return `data/${claim.domain}/claims/${claim.id}.md`;
}

/**
 * Append an edge to an existing `edges.yaml` file's content, returning the new
 * content.
 *
 * Unlike a claim (a whole new file), an edge joins a YAML list that already
 * holds others. The existing text is preserved verbatim and the edge is added
 * as one more list item, so the PR diff is exactly the lines added —
 * re-serializing the whole list would reformat every existing entry and bury
 * the change in noise.
 *
 * An empty, whitespace-only, or `[]` file — a domain's first edge, or the
 * reserved-but-empty `cross_domain_edges.yaml` — starts a fresh list.
 */
export function appendEdgeToYaml(existing: string, edge: Edge): string {
  const item = edgeYamlListItem(edge);
  const trimmed = existing.replace(/\s+$/, "");
  if (trimmed === "" || trimmed === "[]") return item;
  return `${trimmed}\n${item}`;
}

/** One edge serialized as a YAML list item block (`- id: …`). */
function edgeYamlListItem(edge: Edge): string {
  // Drop keys the loader defaults, so a rationale-only edge does not carry an
  // empty `sources: []` line the hand-authored files omit.
  const bare: Record<string, unknown> = {
    id: edge.id,
    fromId: edge.fromId,
    toId: edge.toId,
    kind: edge.kind,
    strength: edge.strength,
  };
  if (edge.rationale) bare.rationale = edge.rationale;
  if (edge.sources.length > 0) bare.sources = edge.sources;

  const doc = new YAML.Document([bare]);
  quoteTimestamps(doc);
  return doc.toString(STRINGIFY);
}
