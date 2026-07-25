/**
 * Content negotiation for the Markdown twins.
 *
 * aboard already publishes a Markdown twin next to every page it has one for
 * (`/claims/{id}/index.md` and friends). Negotiation lets an agent ask for the
 * twin at the *page's own* URL with `Accept: text/markdown`, so it does not
 * have to know the twin convention to get Markdown out of a link it was handed.
 *
 * Both functions here are pure so the Worker stays a thin shell over tested
 * logic (see the module header in `worker/index.ts`). The Worker owns only the
 * asset lookup and the response headers.
 */

type MediaRange = { type: string; q: number };

function parseAccept(header: string): MediaRange[] {
  const ranges: MediaRange[] = [];

  for (const part of header.split(",")) {
    const [media, ...params] = part.split(";");
    const type = media.trim().toLowerCase();
    if (!type) continue;

    let q = 1;
    for (const param of params) {
      const match = /^\s*q\s*=\s*([0-9]*\.?[0-9]+)\s*$/i.exec(param);
      if (!match) continue;
      const parsed = Number(match[1]);
      q = Number.isFinite(parsed) ? parsed : 0;
    }

    ranges.push({ type, q });
  }

  return ranges;
}

// The quality the client assigned to `mediaType`, by RFC 9110 precedence: an
// exact match outranks a subtype wildcard, which outranks the bare */* range.
// 0 when nothing matches, which is also how "the client never mentioned it"
// reads.
function qualityFor(ranges: MediaRange[], mediaType: string): number {
  const [group] = mediaType.split("/");

  for (const candidate of [mediaType, `${group}/*`, "*/*"]) {
    const matches = ranges.filter((r) => r.type === candidate);
    if (matches.length > 0) return Math.max(...matches.map((r) => r.q));
  }

  return 0;
}

// Does this `Accept` header ask for Markdown in preference to HTML?
//
// `text/markdown` has to be named explicitly. A wildcard alone never counts,
// which is what keeps HTML the default: a bare */* Accept (curl, and plenty of
// naive clients) scores Markdown and HTML equally, and serving Markdown to
// those would be a surprising answer to an unopinionated question.
//
// A tie between explicit `text/markdown` and `text/html` resolves to Markdown.
// Only a client that went out of its way to name the type is in that branch at
// all, and the two are equally acceptable to it by its own weighting.
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;

  const ranges = parseAccept(accept);
  const markdown = ranges.filter((r) => r.type === "text/markdown");
  if (markdown.length === 0) return false;

  const markdownQ = Math.max(...markdown.map((r) => r.q));
  if (markdownQ <= 0) return false;

  return markdownQ >= qualityFor(ranges, "text/html");
}

/**
 * The Markdown twin path for a page path, or null when the path is not a page
 * that could have one.
 *
 * The twin convention is uniform — `<page>/index.md`, with `/` mapping to
 * `/index.md` — so this never needs a list of which pages have twins. Whether
 * the twin actually exists is answered by the asset lookup, not here, which is
 * what lets new twins negotiate the moment they are added.
 */
export function markdownTwinPath(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;

  const clean = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (clean === "/") return "/index.md";

  const segments = clean.slice(1).split("/");

  // A dot in the last segment means the client already asked for a concrete
  // file (`/robots.txt`, or a twin itself). A leading dot anywhere means a
  // well-known path, which is machine-readable already and has no HTML page.
  if (segments.some((s) => s.startsWith("."))) return null;
  if ((segments.at(-1) ?? "").includes(".")) return null;

  // The JSON-LD API and Next's build output are not pages.
  if (segments[0] === "api" || segments[0] === "_next") return null;

  return `${clean}/index.md`;
}
