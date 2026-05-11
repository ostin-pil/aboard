import { getClaim, getDossierForClaim } from "@/lib/graph";
import { dossierLD } from "@/lib/jsonld";
import { cruxRank, type Argument, type Crux } from "@/lib/types";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Fragment } from "react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ claimId: string }>;
}): Promise<Metadata> {
  const { claimId } = await params;
  const claim = getClaim(claimId);
  const dossier = getDossierForClaim(claimId);
  if (!claim || !dossier) {
    return { title: "dossier not found" };
  }
  // PLACEHOLDER: revise after audience decision in research/vision.md
  const description = `Steel-manned, non-convergent dossier on ${claim.id}: ${dossier.cruxes.length} crux${
    dossier.cruxes.length === 1 ? "" : "es"
  } ranked by impact × uncertainty.`;
  const title = `Dossier · ${claim.id} ${claim.title}`;
  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: "aboard",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function DossierPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const claim = getClaim(claimId);
  const dossier = getDossierForClaim(claimId);
  if (!claim || !dossier) notFound();

  const sortedCruxes = [...dossier.cruxes].sort(
    (a, b) => cruxRank(b) - cruxRank(a)
  );
  const total = sortedCruxes.length;
  const ldJson = JSON.stringify(dossierLD(dossier, ""));

  return (
    <main className="dossier-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson }}
      />
      <Link className="breadcrumb" href={`/claims/${claim.id}`}>
        ← <span className="id-mech">{claim.id}</span> · {claim.title}
      </Link>

      <div className="dossier-caption">
        <span className="em">Dossier</span>
        <span className="sep">·</span>
        <span>steel-manned</span>
        <span className="sep">·</span>
        <span>non-convergent</span>
      </div>

      <h1 className="dossier-headline">Is the contested mechanism actually causal?</h1>

      <p className="dossier-lede">
        Two agents argued opposing theses with steel-manned summaries and cited sources.
        Cruxes are ranked by impact × uncertainty. The dossier presents both sides without
        synthesis — at civilizational stakes, structured debate often does not converge,
        and the absence of a verdict is the honest output.
      </p>

      <section className="dossier-cols">
        <DossierColumn label="PRO" arg={dossier.pro} variant="pro" />
        <DossierColumn label="CON" arg={dossier.con} variant="con" />
      </section>

      <section>
        <div className="cruxes-label">
          <span className="em">Cruxes</span>
          <span className="sub">— ranked by impact × uncertainty</span>
        </div>
        <div className="crux-grid">
          {sortedCruxes.map((crux, i) => (
            <CruxCard key={i} crux={crux} rank={i + 1} total={total} />
          ))}
        </div>
      </section>
    </main>
  );
}

function DossierColumn({
  label,
  arg,
  variant,
}: {
  label: string;
  arg: Argument;
  variant: "pro" | "con";
}) {
  return (
    <article className={`dossier-col ${variant}`}>
      <div className="col-label">
        <span className="dot" />
        <span>{label}</span>
        <span className="arg">· thesis</span>
      </div>
      <p className="thesis">{arg.thesis}</p>
      <p className="summary">{arg.steelmannedSummary}</p>

      <div className="col-divider" />

      <div className="src-label">key sources</div>
      <ul className="src-list">
        {arg.keySources.map((s, i) => {
          const metaParts = [
            s.kind,
            s.year ? String(s.year) : null,
            s.authors,
          ].filter(Boolean);
          return (
            <li key={i}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
              {metaParts.length > 0 && (
                <span className="meta">{metaParts.join(" · ")}</span>
              )}
              <span className="url">{s.url}</span>
              {s.finding && <span className="finding">{s.finding}</span>}
            </li>
          );
        })}
      </ul>

      <div className="agent-line">
        agent · <span className="name">{arg.authoredBy.agent}</span>
        {arg.authoredBy.promptTitle && ` · ${arg.authoredBy.promptTitle}`}
      </div>
    </article>
  );
}

function CruxCard({
  crux,
  rank,
  total,
}: {
  crux: Crux;
  rank: number;
  total: number;
}) {
  const score = cruxRank(crux);
  return (
    <article className="crux">
      <div className="num">
        {rank}
        <span className="denom">/{total}</span>
      </div>
      <p className="body">{renderCruxBody(crux.statement)}</p>
      <div className="meta">
        <span className="pair">
          impact <span className="v">{crux.impactScore.toFixed(2)}</span>
        </span>
        <span className="pair">
          uncertainty <span className="v">{crux.uncertainty.toFixed(2)}</span>
        </span>
        <span className="pair">
          rank score <span className="v">{score.toFixed(2)}</span>
        </span>
      </div>
    </article>
  );
}

function renderCruxBody(text: string) {
  const parts = text.split(/(\bpro thesis\b|\bcon thesis\b)/g);
  return parts.map((p, i) => {
    if (/^pro thesis$/.test(p))
      return (
        <Fragment key={i}>
          <span className="pro">pro</span> thesis
        </Fragment>
      );
    if (/^con thesis$/.test(p))
      return (
        <Fragment key={i}>
          <span className="con">con</span> thesis
        </Fragment>
      );
    return <Fragment key={i}>{p}</Fragment>;
  });
}
