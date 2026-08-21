import YAML, { Scalar, visit } from "yaml";
import type { Claim, Dossier, Edge, Prediction } from "@/lib/types";

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
 *
 * "Empty" is decided by parsing, not by string equality. The guard used to be
 * `trimmed === "[]"`, which is true of exactly one spelling of an empty file
 * and false of every other: `[] # reserved for cross-domain edges` (the shape
 * an author reaching for that file is most likely to leave behind) took the
 * append branch and produced
 *
 *     [] # reserved for cross-domain edges
 *     - id: CE4
 *
 * which is not YAML at all — a flow sequence and a block sequence at the same
 * level. The proposal PR then carried a file the loader rejects, and the first
 * thing to notice was CI on the PR. Parsing costs one pass and is true of every
 * spelling: a document whose contents are null (blank, or comments only) or an
 * empty sequence holds no edges, however it was written.
 *
 * Comments on such a file survive the rewrite: they are the author's note about
 * what the file is for, and dropping them to make room for the first edge is
 * the kind of silent loss a PR reviewer would have to catch by memory.
 */
export function appendEdgeToYaml(existing: string, edge: Edge): string {
  const item = edgeYamlListItem(edge);
  const doc = YAML.parseDocument(existing);
  const contents = doc.contents;
  const holdsNoEdges =
    contents === null ||
    contents === undefined ||
    (YAML.isSeq(contents) && contents.items.length === 0);

  if (!holdsNoEdges) return `${existing.replace(/\s+$/, "")}\n${item}`;

  const fresh = YAML.parseDocument(item);
  // Every comment the empty file carried, in reading order, above the first
  // edge. `contents.comment` is the trailing `# …` on an inline `[]`; the two
  // `commentBefore`s are whole-line comments above it.
  const above = [doc.commentBefore, contents?.commentBefore, contents?.comment]
    .filter((c): c is string => Boolean(c))
    .join("\n");
  if (above) fresh.commentBefore = above;
  if (doc.comment) fresh.comment = doc.comment;
  return fresh.toString(STRINGIFY);
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

/**
 * The key a relation is identified by: its two endpoints and its kind.
 *
 * An edge's *id* is bookkeeping; its *relation* is the claim it makes. Two
 * edges with different ids and the same `(fromId, kind, toId)` say the same
 * thing twice, which is the duplicate the write path refuses.
 *
 * Direction is part of the key. `A causes B` and `B causes A` are different
 * claims, and the second is not a duplicate of the first — it is a
 * contradiction, and one a reviewer should see rather than one the API should
 * swallow.
 */
export function relationKey(fromId: string, kind: string, toId: string): string {
  return `${fromId}\u0000${kind}\u0000${toId}`;
}

/** What an `edges.yaml` already holds, for the checks the write path runs. */
export type EdgeIndex = {
  /** Every edge id in the file. */
  ids: ReadonlySet<string>;
  /** relationKey → the id of the edge already asserting it. */
  relations: ReadonlyMap<string, string>;
};

/**
 * Read an edges file into the two things the write path needs to check.
 *
 * Read from the file at the base ref rather than from `/api/graph`, and that is
 * the whole point. The Worker mints ids against the *deployed* graph, which
 * lags `main` by a Cloudflare Workers Builds cycle; inside that window the
 * graph says `E12` is free while `edges.yaml` on the base branch already holds
 * it. Session 51 closed exactly this window for claims and dossiers, where the
 * collision surfaces as a GitHub 422 on a create. An edge appends to a file
 * that already exists, so it never reaches the create path and never got the
 * treatment — the duplicate id rode into the PR and failed CI's integrity
 * check, on the reviewer's time rather than the caller's.
 *
 * Tolerant by design: a file it cannot parse, or one holding something other
 * than a list, yields an empty index rather than throwing. The caller is about
 * to append to that file and the loader will reject it either way; failing the
 * proposal with a YAML error the caller cannot act on would trade a legible
 * downstream failure for an illegible upstream one.
 */
export function edgeIndex(existing: string): EdgeIndex {
  const ids = new Set<string>();
  const relations = new Map<string, string>();

  let parsed: unknown;
  try {
    parsed = YAML.parse(existing);
  } catch {
    return { ids, relations };
  }
  if (!Array.isArray(parsed)) return { ids, relations };

  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : null;
    if (id) ids.add(id);
    const { fromId, toId, kind } = e;
    if (typeof fromId !== "string" || typeof toId !== "string" || typeof kind !== "string") {
      continue;
    }
    const key = relationKey(fromId, kind, toId);
    // First writer wins, so the id reported to the caller is the one that has
    // been there longest rather than whichever happened to be last in the file.
    if (!relations.has(key)) relations.set(key, id ?? "(unnamed edge)");
  }

  return { ids, relations };
}

/**
 * Append a prediction to an existing forecast file's `predictions` list,
 * returning the new content.
 *
 * A prediction joins a list *nested inside* the forecast object, so this parses
 * with the document API and adds one node to that list rather than reformatting
 * the file: the eemeli/yaml document preserves the original nodes' style, so the
 * diff is the appended prediction and nothing else.
 *
 * Timestamps are NOT quoted here, unlike a claim's: forecast files are read by
 * the `yaml` package (YAML 1.2), which does not coerce an ISO scalar to a Date,
 * and the hand-authored files leave them unquoted. Matching that keeps the diff
 * clean.
 */
export function appendPredictionToForecast(existing: string, prediction: Prediction): string {
  const doc = YAML.parseDocument(existing);
  const preds = doc.get("predictions");
  if (YAML.isSeq(preds)) {
    preds.add(doc.createNode(prediction));
  } else {
    doc.set("predictions", doc.createNode([prediction]));
  }
  // Default line width, NOT the STRINGIFY lineWidth:0 the claim/edge writers use.
  // The forecast files were written with the yaml package's default folding, so
  // re-serializing that way reproduces every existing line byte-for-byte and the
  // diff is only the appended prediction. lineWidth:0 would unfold every long
  // string in the file and reformat the whole thing.
  return doc.toString();
}

/**
 * A complete dossier → a new YAML file.
 *
 * Always a fresh file (the write path only creates a dossier where none exists),
 * so there is no existing content to preserve — default line width, matching the
 * folded style of the hand-authored dossiers. Timestamps stay unquoted: like
 * forecasts, dossier files are read by the `yaml` package (YAML 1.2), which does
 * not coerce an ISO scalar to a Date.
 */
export function dossierToYaml(dossier: Dossier): string {
  return new YAML.Document(dossier).toString();
}

/** Repo-relative path a dossier belongs at (keyed by its claim). */
export function dossierPath(claimId: string, domain: string): string {
  return `data/${domain}/dossiers/${claimId}.yaml`;
}
