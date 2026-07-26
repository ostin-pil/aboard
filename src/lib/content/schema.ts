import { z } from "zod";

/**
 * Frontmatter schemas for the `content/` tree.
 *
 * Editorial prose is content, not code, and it is loaded and validated the same
 * way `data/` is: frontmatter is the metadata, the Markdown body is the prose.
 * A missing or empty field fails the build rather than rendering a blank
 * paragraph, which is the property that makes a content tree safer than the
 * constants module this replaced.
 *
 * Structured blocks (the module cards, the two readings, the spread table) live
 * in frontmatter rather than in the body because they are data with a layout,
 * not prose. Everything a Markdown document can express — paragraphs, lists,
 * emphasis, code, tables — stays in the body.
 */

/** Trimmed and non-empty. Whitespace-only copy is a content bug, not a value. */
const line = z.string().trim().min(1);

/**
 * Site-wide strings. This is the one document that is all frontmatter and no
 * body: every field is a short string consumed by a `<meta>` tag, an OG card or
 * a text/plain surface, none of which can render Markdown.
 */
export const SiteDoc = z.object({
  /** `<title>` default. */
  title: line,
  /** `<meta name="description">`, and the OG and Twitter descriptions with it. */
  description: line,
  /**
   * The positioning sentence. Opens the homepage hero and is quoted by the
   * homepage Markdown twin, so unlike the other fields here it may carry inline
   * Markdown: both consumers render it.
   */
  summary: line,
  /** One line on provenance, for the twin. The hero has no room for it. */
  provenance: line,
  /** The homepage headline, up to the tagline. */
  headline: line,
  /** The OG card headline, up to the tagline. The card has less room. */
  ogHeadline: line,
  /** The tagline's second half, set apart typographically wherever it appears. */
  tagline: line,
  /**
   * The `llms.txt` summary. Deliberately not `summary`: it addresses an agent
   * deciding what to fetch, so it leads with the JSON-LD contract and names the
   * three modules, where `summary` leads with what the project is for.
   */
  agentIntro: line,
});
export type SiteDoc = z.infer<typeof SiteDoc>;

/** The homepage. Its body is the hero lede, and doubles as the twin's prose. */
export const HomeDoc = z.object({
  title: line,
});
export type HomeDoc = z.infer<typeof HomeDoc>;

/** One of the three modules over the shared claim graph. */
export const AboutModule = z.object({
  tag: line,
  name: line,
  body: line,
});
export type AboutModule = z.infer<typeof AboutModule>;

/** One of the two defensible readings of the F4 spread. */
export const AboutReading = z.object({
  label: line,
  title: line,
  body: line,
  implies: line,
});
export type AboutReading = z.infer<typeof AboutReading>;

/**
 * The about page: prose in the body, its two card layouts here.
 *
 * The spread table is not here. It is ordinary tabular content, so it lives in
 * the body as a GFM table; only blocks Markdown genuinely cannot express earn a
 * frontmatter entry and a slot.
 */
export const AboutDoc = z.object({
  /** Metadata title, which the layout template renders as "About — aboard". */
  title: line,
  /** The visible `<h1>`, which is a question rather than the page's name. */
  headline: line,
  modules: z.array(AboutModule).min(1),
  readings: z.array(AboutReading).min(2),
  /**
   * Editorial commentary for the spread table, keyed by forecast id.
   *
   * Only the commentary is authored. Each row's median and spread are derived
   * from `data/` by `spread.ts`, which also asserts that these keys and the
   * ensemble forecasts match in both directions.
   */
  spreadReadings: z.record(z.string(), line),
});
export type AboutDoc = z.infer<typeof AboutDoc>;
