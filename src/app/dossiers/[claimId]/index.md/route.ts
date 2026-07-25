import { getClaim, getClaimsWithDossiers, getDossierForClaim } from "@/lib/graph";
import { siteBaseUrl } from "@/lib/site";
import { cruxRank, type Argument } from "@/lib/types";

// Static-export one Markdown twin per dossier at build time (output: "export").
export const dynamic = "force-static";

export function generateStaticParams() {
  return getClaimsWithDossiers().map((c) => ({ claimId: c.id }));
}

const MD = { "Content-Type": "text/markdown; charset=utf-8", "Access-Control-Allow-Origin": "*" };

function argumentSection(label: string, arg: Argument): string[] {
  const lines = [`## ${label}`, "", `**Thesis.** ${arg.thesis}`, "", arg.steelmannedSummary];

  if (arg.keySources.length > 0) {
    lines.push("", `### ${label} key sources`, "");
    for (const s of arg.keySources) {
      lines.push(`- [${s.label}](${s.url})` + (s.finding ? ` — ${s.finding}` : ""));
    }
  }

  lines.push(
    "",
    `Authored by ${arg.authoredBy.agent}` +
      (arg.authoredBy.promptTitle ? ` (prompt: ${arg.authoredBy.promptTitle})` : "") +
      `, generated ${arg.authoredBy.generatedAt}.`,
  );

  return lines;
}

/**
 * `/dossiers/{claimId}/index.md` — the Markdown twin of a dual-dossier page,
 * and what an agent gets when it asks `/dossiers/{claimId}` for
 * `text/markdown`.
 *
 * The whole point of a dossier is that both sides are readable at equal
 * strength, which survives the move to Markdown intact: two symmetrical
 * sections, then the cruxes ranked by impact times uncertainty exactly as the
 * page ranks them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ claimId: string }> },
) {
  const { claimId } = await params;
  const claim = getClaim(claimId);
  const dossier = getDossierForClaim(claimId);
  if (!claim || !dossier) {
    return new Response("# Not found\n", { status: 404, headers: MD });
  }

  const base = siteBaseUrl();
  const ranked = [...dossier.cruxes].sort((a, b) => cruxRank(b) - cruxRank(a));

  const lines: string[] = [
    `# Dossier: ${claim.id} — ${claim.title}`,
    "",
    `HTML: ${base}/dossiers/${claim.id} · Claim: ${base}/claims/${claim.id}/index.md` +
      ` · JSON-LD: ${base}/api/claims/${claim.id}`,
    "",
    "Non-convergent by design. Both positions are steel-manned and held open;",
    "the cruxes below are ranked by impact times uncertainty, so the top one is",
    "the question whose resolution would move the disagreement most.",
    "",
    "## Claim under debate",
    "",
    claim.statement,
    "",
    ...argumentSection("Pro", dossier.pro),
    "",
    ...argumentSection("Con", dossier.con),
  ];

  if (ranked.length > 0) {
    lines.push("", "## Cruxes (ranked)", "");
    ranked.forEach((crux, i) => {
      lines.push(
        `${i + 1}. ${crux.statement}`,
        `   impact ${crux.impactScore.toFixed(2)} · uncertainty ${crux.uncertainty.toFixed(2)}` +
          ` · rank score ${cruxRank(crux).toFixed(3)}`,
      );
    });
  }

  lines.push("");
  return new Response(lines.join("\n"), { headers: MD });
}
