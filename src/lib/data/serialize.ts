import YAML, { Scalar, visit } from "yaml";
import type { Claim } from "@/lib/types";

/**
 * YAML resolves an *unquoted* ISO date or datetime to its timestamp type, and
 * the loader's parser (gray-matter → js-yaml) therefore hands it back as a
 * `Date`. Our schema types those fields as strings, so an unquoted timestamp
 * does not round-trip: the file is written, and then fails to parse.
 *
 * Every hand-authored file in `data/` quotes its timestamps for exactly this
 * reason. The serializer has to do the same, and the round-trip test in
 * serialize/proposals.test.ts is what keeps it honest.
 */
const YAML_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:[Tt ].*)?$/;

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
  visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value === "string" && YAML_TIMESTAMP.test(node.value)) {
        node.type = Scalar.QUOTE_SINGLE;
      }
    },
  });

  // lineWidth: 0 disables line folding. Folded prose round-trips fine, but the
  // diff a human reviews in the PR is far uglier.
  const yaml = doc.toString({ lineWidth: 0 });
  return `---\n${yaml}---\n\n${statement.trim()}\n`;
}

/** Repo-relative path a claim belongs at, per the layout in CLAUDE.md. */
export function claimPath(claim: Pick<Claim, "id" | "domain">): string {
  return `data/${claim.domain}/claims/${claim.id}.md`;
}
