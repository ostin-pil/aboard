import {
  getClaim,
  getClaims,
  getEdgesForClaim,
  getForecastsForClaim,
  getDossierForClaim,
} from "@/lib/graph";
import { aggregate } from "@/lib/forecast";
import { siteBaseUrl } from "@/lib/site";

// Static-export one Markdown twin per claim at build time (output: "export").
export const dynamic = "force-static";

export function generateStaticParams() {
  return getClaims().map((c) => ({ id: c.id }));
}

const MD = { "Content-Type": "text/markdown; charset=utf-8", "Access-Control-Allow-Origin": "*" };

/**
 * `/claims/{id}/index.md` — a dereferenceable Markdown twin of a claim page,
 * following Cloudflare's page-Markdown convention. Neighbor links point at
 * other twins so an agent can traverse the graph in Markdown alone; the HTML
 * page and the JSON-LD record are linked at the top.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claim = getClaim(id);
  if (!claim) {
    return new Response("# Not found\n", { status: 404, headers: MD });
  }

  const base = siteBaseUrl();
  const { incoming, outgoing } = getEdgesForClaim(id);
  const forecasts = getForecastsForClaim(id);
  const dossier = getDossierForClaim(id);

  const lines: string[] = [
    `# ${claim.id}: ${claim.title}`,
    "",
    `**Kind:** ${claim.kind} · **Domain:** ${claim.domain} · **Confidence:** ${claim.confidence.toFixed(2)}`,
    "",
    `HTML: ${base}/claims/${claim.id} · JSON-LD: ${base}/api/claims/${claim.id}`,
    "",
    "## Statement",
    "",
    claim.statement,
  ];

  if (outgoing.length > 0 || incoming.length > 0) {
    lines.push("", "## Causal links", "");
    for (const e of outgoing) {
      const t = getClaim(e.toId);
      if (!t) continue;
      lines.push(
        `- ${e.kind} → [${t.id}: ${t.title}](${base}/claims/${t.id}/index.md) (strength ${e.strength.toFixed(2)})` +
          (e.rationale ? ` — ${e.rationale}` : "")
      );
    }
    for (const e of incoming) {
      const s = getClaim(e.fromId);
      if (!s) continue;
      lines.push(
        `- ${e.kind} ← [${s.id}: ${s.title}](${base}/claims/${s.id}/index.md) (strength ${e.strength.toFixed(2)})` +
          (e.rationale ? ` — ${e.rationale}` : "")
      );
    }
  }

  if (forecasts.length > 0) {
    lines.push("", "## Forecasts", "");
    for (const f of forecasts) {
      const stats = aggregate(f.predictions);
      lines.push(
        `- **${f.id}** (resolves ${f.resolutionDate}): ${f.question} — P=${stats.median.toFixed(2)}` +
          (stats.count > 1 ? ` across ${stats.count} models, spread ${stats.spread.toFixed(2)}` : "")
      );
    }
  }

  if (dossier) {
    lines.push(
      "",
      "## Dossier",
      "",
      `Contested — steel-manned pro/con with ranked cruxes: ${base}/dossiers/${claim.id}`
    );
  }

  if (claim.sources.length > 0) {
    lines.push("", "## Sources", "");
    for (const s of claim.sources) {
      lines.push(`- [${s.label}](${s.url})` + (s.finding ? ` — ${s.finding}` : ""));
    }
  }

  lines.push(
    "",
    "## Provenance",
    "",
    `Authored by ${claim.authoredBy.agent}` +
      (claim.authoredBy.promptTitle ? ` (prompt: ${claim.authoredBy.promptTitle})` : "") +
      `, generated ${claim.authoredBy.generatedAt}.`,
    ""
  );

  return new Response(lines.join("\n"), { headers: MD });
}
