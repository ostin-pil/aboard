import { about } from "@/lib/content/loader";
import { interpolate, splitSlots } from "@/lib/content/render";
import { aboutVars } from "@/lib/content/vars";
import { siteBaseUrl } from "@/lib/site";

// Static-export to out/about/index.md at build time (output: "export").
export const dynamic = "force-static";

/**
 * `/about/index.md` — the Markdown twin of the about page, and what an agent
 * gets when it asks `/about` for `text/markdown`.
 *
 * Session 28 shipped the negotiation but excluded `/about`, because its prose
 * was hand-written in TSX and a twin would have been a hand copy of it. Now
 * that the prose is `content/about.md`, this route serves that body rather than
 * restating it, so the two representations are the same document. The Worker
 * needs no change: `markdownTwinPath` already maps `/about` here, and twin
 * existence is answered by the asset lookup.
 */

const LABEL = "content/about.md";

/**
 * Markdown for the blocks the page renders as card layouts. The HTML page
 * positions these with `<!-- slot: -->` markers; a reader of the twin gets the
 * same content in the same place, as prose a Markdown client can render.
 */
function slotMarkdown(name: string): string {
  switch (name) {
    case "modules":
      return about.data.modules.map((m) => `**${m.tag}. ${m.name}** — ${m.body}`).join("\n\n");
    case "readings":
      return about.data.readings
        .map((r) => `**${r.label}: ${r.title}** — ${r.body}\n\n_Implies:_ ${r.implies}`)
        .join("\n\n");
    default:
      throw new Error(`${LABEL}: no Markdown for slot "${name}"`);
  }
}

export function GET() {
  const base = siteBaseUrl();
  const vars = aboutVars();

  const body = splitSlots(interpolate(about.body, vars, LABEL))
    .map((part) => (part.kind === "html" ? part.html : slotMarkdown(part.name)))
    .join("\n\n");

  const lines: string[] = [
    `# ${about.data.headline}`,
    "",
    `HTML: ${base}/about · Full graph as JSON-LD: ${base}/api/graph`,
    "",
    body,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
