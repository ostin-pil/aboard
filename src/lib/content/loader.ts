import "server-only";
import { readFileSync } from "fs";
import { join, relative } from "path";
import { parseDocument, type ParsedDocument } from "@/lib/content/parse";
import { AboutDoc, HomeDoc, SiteDoc } from "@/lib/content/schema";

/**
 * Reads the `content/` tree. The thin IO shell over `parse.ts`: this module
 * touches the filesystem and nothing else, so the parsing and validation it
 * delegates to stay unit-testable under the node-environment vitest config.
 *
 * Memoized by being module-level, the same way `src/lib/data/loader.ts` is. The
 * documents are read once per build, and a document that fails validation
 * throws here, which fails `next build` rather than rendering an empty section.
 */

const CONTENT_ROOT = join(process.cwd(), "content");

function load<T>(slug: string, schema: Parameters<typeof parseDocument<T>>[1]): ParsedDocument<T> {
  const file = join(CONTENT_ROOT, `${slug}.md`);
  return parseDocument(readFileSync(file, "utf8"), schema, relative(process.cwd(), file));
}

/** Site-wide strings: `<meta>` copy, the tagline halves, the agent intro. */
export const site = load("site", SiteDoc).data;

/** The homepage. Its body is the hero lede and the Markdown twin's prose. */
export const home = load("home", HomeDoc);

/** The about page: prose sections in the body, card data in frontmatter. */
export const about = load("about", AboutDoc);
