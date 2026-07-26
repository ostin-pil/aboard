import matter from "gray-matter";
import type { ZodType } from "zod";

/**
 * Pure parsing for `content/` documents: frontmatter validation and splitting a
 * body into its H2 sections. No filesystem access, so this is unit-testable
 * under the node-environment vitest config; `loader.ts` is the thin IO shell
 * that reads files and calls in here. Same split as `markdown-negotiation.ts`
 * and the Worker.
 */

/** One `## ` section of a document body, keyed by a slug derived from its title. */
export type Section = {
  slug: string;
  title: string;
  markdown: string;
};

export type ParsedDocument<T> = {
  data: T;
  /** The body verbatim, which is what a Markdown twin serves. */
  body: string;
  sections: Section[];
};

/** Everything before the first `## ` heading, which has no title of its own. */
export const INTRO_SLUG = "intro";

/**
 * Kebab-cased heading text. Apostrophes are dropped rather than replaced so
 * "Why dossiers don't synthesize" slugs to `why-dossiers-dont-synthesize`
 * instead of growing a double hyphen.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Splits a body on its `## ` headings. Content before the first heading becomes
 * the `intro` section, so a page can render its lede without the document
 * needing a heading it would not display.
 *
 * Fenced code blocks are skipped, so a `## ` inside a fence is body text rather
 * than a section boundary.
 */
export function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { slug: INTRO_SLUG, title: "", markdown: "" };
  const lines: string[] = [];
  let fenced = false;

  const flush = () => {
    current.markdown = lines.join("\n").trim();
    if (current.markdown.length > 0 || current.slug !== INTRO_SLUG) {
      sections.push(current);
    }
    lines.length = 0;
  };

  for (const raw of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) fenced = !fenced;
    const heading = fenced ? null : /^##\s+(.+?)\s*$/.exec(raw);
    if (heading) {
      flush();
      const title = heading[1];
      current = { slug: slugify(title), title, markdown: "" };
      continue;
    }
    lines.push(raw);
  }
  flush();

  return sections;
}

/**
 * Parses one document: validates frontmatter against `schema`, returns the body
 * verbatim and its sections.
 *
 * `label` is the repo-relative path, so a validation failure names the file a
 * writer has to open. Throwing is deliberate: the loader runs at build time, so
 * an invalid document fails `next build` rather than shipping an empty section.
 */
export function parseDocument<T>(raw: string, schema: ZodType<T>, label: string): ParsedDocument<T> {
  const { data, content } = matter(raw);
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`${label}: invalid frontmatter — ${issues}`);
  }
  const body = content.trim();
  return { data: result.data, body, sections: splitSections(body) };
}

/**
 * Looks up a section, throwing when it is missing.
 *
 * A page that renders `sections.find(...)?.html` silently drops a whole section
 * when a heading is renamed. Failing the build instead is the same trade the
 * frontmatter schema makes.
 */
export function requireSection(sections: Section[], slug: string, label: string): Section {
  const found = sections.find((s) => s.slug === slug);
  if (!found) {
    const known = sections.map((s) => s.slug).join(", ");
    throw new Error(`${label}: no section "${slug}" (have: ${known})`);
  }
  return found;
}
