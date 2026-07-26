import { about } from "@/lib/content/loader";
import type { ContentVars } from "@/lib/content/render";
import { spreadRows, type SpreadRow } from "@/lib/content/spread";
import { getClaim, getClaims, graph } from "@/lib/graph";

/**
 * Placeholder values for `content/about.md`, derived from the graph.
 *
 * Shared by the about page and its Markdown twin so the two cannot disagree
 * about how many claims there are, which is the drift session 26 removed from
 * the page and this keeps removed now that the prose lives in a file.
 */

const DOMAIN_LABELS: Record<string, string> = {
  democratic_backsliding: "democratic backsliding",
  inequality: "inequality",
  epistack_cases: "epistemic case studies",
};

/** "a, b, and c" — an Oxford-comma list, or the bare name when there is one. */
function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/**
 * The spread table's rows. Shared by the page and the twin, and the source of
 * the `ensembleCount` placeholder so the sentence introducing the table cannot
 * disagree with the table under it.
 */
export function aboutSpreadRows(): SpreadRow[] {
  return spreadRows(graph.forecasts, about.data.spreadReadings, "content/about.md");
}

export function aboutVars(): ContentVars {
  const claims = getClaims();
  const domains = [...new Set(claims.map((c) => c.domain))];
  const crossDomainEdges = graph.edges.filter((e) => {
    const a = getClaim(e.fromId);
    const b = getClaim(e.toId);
    return a && b && a.domain !== b.domain;
  }).length;

  return {
    domainCount: domains.length,
    domainList: listOf(domains.map((d) => DOMAIN_LABELS[d] ?? d.replace(/_/g, " "))),
    claimCount: claims.length,
    forecastCount: graph.forecasts.length,
    ensembleCount: aboutSpreadRows().length,
    crossDomainEdges,
    dossierCount: graph.dossiers.length,
  };
}
