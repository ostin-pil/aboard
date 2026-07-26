import { marked } from "marked";

/**
 * Pure rendering for `content/` documents: placeholder interpolation, Markdown
 * to HTML, and splitting a rendered section at its component slots.
 *
 * Sanitization is deliberately absent. Every document this renders is authored
 * in-repo, reviewed in a pull request, and rendered at build time under
 * `output: "export"`; no request input and no agent proposal reaches it. The
 * write path produces `data/` PRs, never site copy. If editorial content ever
 * becomes agent-writable, this is the module that has to grow a sanitizer, and
 * that change belongs in the same commit as the one that opens the path.
 */

/** Values a document may interpolate, supplied by the page from the graph. */
export type ContentVars = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/**
 * Replaces `{{name}}` with a caller-supplied value.
 *
 * Counts on the about page drift the moment they are typed as literals, which
 * is what session 26 fixed by deriving them from the graph. Keeping them as
 * placeholders means the prose can live in a Markdown file without giving that
 * up. An unknown placeholder throws rather than rendering literally: a typo in
 * a template that silently ships `{{clamCount}}` to a reader is the failure
 * this is guarding.
 */
export function interpolate(text: string, vars: ContentVars, label: string): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      const known = Object.keys(vars).join(", ");
      throw new Error(`${label}: unknown placeholder {{${name}}} (have: ${known})`);
    }
    return String(value);
  });
}

/**
 * Markdown to HTML. GFM is on, so the spread table can be an ordinary Markdown
 * table rather than hand-built rows.
 */
export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true }).trim();
}

/** Interpolate, then render. The order matters: a placeholder is not Markdown. */
export function renderContent(markdown: string, vars: ContentVars, label: string): string {
  return renderMarkdown(interpolate(markdown, vars, label));
}

/**
 * A run of content, or a named slot where the page injects a component.
 *
 * The `html` variant is named for its usual case. An HTML comment survives
 * Markdown rendering unchanged, so `splitSlots` works on a body either before
 * or after `renderMarkdown`, and the Markdown twin splits the raw body to emit
 * prose instead of components.
 */
export type Part = { kind: "html"; html: string } | { kind: "slot"; name: string };

const SLOT = /<!--\s*slot:\s*([a-zA-Z][a-zA-Z0-9-]*)\s*-->/g;

/**
 * Splits rendered HTML at `<!-- slot: name -->` markers.
 *
 * Card grids and other laid-out blocks cannot be expressed in Markdown, but
 * they still have to sit at a particular point in the prose. A slot marker lets
 * the document say where without the page having to guess, and without the
 * prose being cut into a section per component.
 */
export function splitSlots(html: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const match of html.matchAll(SLOT)) {
    const before = html.slice(last, match.index).trim();
    if (before.length > 0) parts.push({ kind: "html", html: before });
    parts.push({ kind: "slot", name: match[1] });
    last = match.index + match[0].length;
  }
  const tail = html.slice(last).trim();
  if (tail.length > 0) parts.push({ kind: "html", html: tail });
  return parts;
}
